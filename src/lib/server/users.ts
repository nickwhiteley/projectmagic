// Who may sign in (specs/tenants.md §3.1): anyone with a GitHub account while sign-up is open or
// waits for approval, and otherwise only people who already have an app_user row. The first
// platform admin comes from BOOTSTRAP_ADMIN_GITHUB_LOGIN, on first sign-in, while none exists.
import { BOOTSTRAP_ADMIN_GITHUB_LOGIN, TOKEN_ENCRYPTION_KEY } from '$app/env/private';
import type { Membership, User } from '#lib/core/access.ts';
import { encrypt } from './crypto.ts';
import { db } from './db.ts';
import type { GitHubUser, UserTokens } from './github-app.ts';
import type { SignupMode } from '#lib/core/tenants.ts';

export interface SessionUser extends User {
	githubLogin: string;
	githubId: string;
	name: string | null;
}

interface UserRow {
	id: string;
	github_id: string;
	github_login: string;
	name: string | null;
	platform_role: 'admin' | 'none';
	disabled_at: Date | null;
}

const toUser = (r: UserRow): SessionUser => ({
	id: String(r.id),
	githubLogin: r.github_login,
	githubId: String(r.github_id),
	name: r.name,
	platformRole: r.platform_role,
	disabledAt: r.disabled_at?.toISOString() ?? null
});

export async function userById(id: string): Promise<SessionUser | null> {
	const [r] = await db()<UserRow[]>`
		select id, github_id, github_login, name, platform_role, disabled_at from app_user where id = ${id}`;
	return r ? toUser(r) : null;
}

/** The signed-in user and their memberships in one round trip: every request needs both. */
export async function sessionUser(
	id: string
): Promise<{ user: SessionUser; memberships: Membership[] } | null> {
	const [r] = await db()<
		(UserRow & { memberships: { project_id: string; role: Membership['role'] }[] })[]
	>`
		select u.id, u.github_id, u.github_login, u.name, u.platform_role, u.disabled_at,
			coalesce(json_agg(json_build_object('project_id', m.project_id, 'role', m.role))
				filter (where m.project_id is not null), '[]') as memberships
		from app_user u left join membership m on m.user_id = u.id
		where u.id = ${id} group by u.id`;
	if (!r) return null;
	return {
		user: toUser(r),
		memberships: r.memberships.map((m) => ({
			userId: String(r.id),
			projectId: String(m.project_id),
			role: m.role
		}))
	};
}

export async function membershipsOf(userId: string): Promise<Membership[]> {
	const rows = await db()<{ project_id: string; role: Membership['role'] }[]>`
		select project_id, role from membership where user_id = ${userId}`;
	return rows.map((r) => ({ userId, projectId: String(r.project_id), role: r.role }));
}

export type SignInResult =
	{ ok: true; user: SessionUser } | { ok: false; reason: 'not-invited' | 'disabled' };

/** After GitHub has said who they are: find their row, or make one if sign-up allows it. */
export async function signIn(
	gh: GitHubUser,
	tokens: UserTokens,
	signup: SignupMode,
	/** Asked only of a stranger while sign-up is closed: do they hold an invitation, or reach a tenant that admits them? */
	admitted: () => Promise<boolean> = async () => false
): Promise<SignInResult> {
	const sealed = tokens.refreshToken ? encrypt(tokens.refreshToken, TOKEN_ENCRYPTION_KEY) : null;
	return db()
		.begin(async (tx) => {
			let [row] = await tx<UserRow[]>`
			update app_user
			set github_login = ${gh.login}, name = ${gh.name},
				refresh_token_enc = coalesce(${sealed}, refresh_token_enc),
				refresh_token_expires_at = coalesce(${tokens.refreshExpiresAt}, refresh_token_expires_at)
			where github_id = ${gh.id}
			returning id, github_id, github_login, name, platform_role, disabled_at`;
			if (!row) {
				const bootstrap = BOOTSTRAP_ADMIN_GITHUB_LOGIN?.toLowerCase() === gh.login.toLowerCase();
				// Serialise concurrent first sign-ins, so only one bootstrap admin is made.
				await tx`lock table app_user in share row exclusive mode`;
				const [{ admins }] = await tx<{ admins: number }[]>`
				select count(*)::int as admins from app_user where platform_role = 'admin'`;
				const first = bootstrap && admins === 0;
				if (!first && signup === 'closed' && !(await admitted()))
					return { ok: false, reason: 'not-invited' } as const;
				[row] = await tx<UserRow[]>`
				insert into app_user (github_id, github_login, name, platform_role, refresh_token_enc, refresh_token_expires_at)
				values (${gh.id}, ${gh.login}, ${gh.name}, ${first ? 'admin' : 'none'}, ${sealed}, ${tokens.refreshExpiresAt})
				returning id, github_id, github_login, name, platform_role, disabled_at`;
			}
			if (row.disabled_at) return { ok: false, reason: 'disabled' } as const;
			return { ok: true, user: toUser(row) } as const;
		})
		.then(async (r) => {
			// A new sign-in mends a refused refresh (PM54); before migration 016 there is nothing to clear.
			if (r.ok && sealed)
				await db()`update app_user set refresh_error = null, refresh_error_at = null
				where id = ${r.user.id} and refresh_error is not null`.catch(() => {});
			return r;
		});
}

export interface UserSummary {
	id: string;
	login: string;
	name: string | null;
	platformRole: 'admin' | 'none';
	disabled: boolean;
	createdAt: string;
	tenants: { name: string; role: string }[];
}

/** Everyone who has signed in, for platform admins (§9.3): by login, with their tenants. */
export async function listUsers(search = ''): Promise<UserSummary[]> {
	const like = `%${search.trim().replace(/[\\%_]/g, '\\$&')}%`;
	const rows = await db()<
		{
			id: string;
			github_login: string;
			name: string | null;
			platform_role: 'admin' | 'none';
			disabled_at: Date | null;
			created_at: Date;
			tenants: { name: string; role: string }[];
		}[]
	>`select u.id, u.github_login, u.name, u.platform_role, u.disabled_at, u.created_at,
			coalesce(json_agg(json_build_object('name', t.name, 'role', m.role) order by t.name) filter (where t.id is not null), '[]') as tenants
		from app_user u left join tenant_member m on m.user_id = u.id left join tenant t on t.id = m.tenant_id and t.status <> 'deleted'
		where u.github_login ilike ${like} or u.name ilike ${like}
		group by u.id order by lower(u.github_login) limit 200`;
	return rows.map((r) => ({
		id: String(r.id),
		login: r.github_login,
		name: r.name,
		platformRole: r.platform_role,
		disabled: !!r.disabled_at,
		createdAt: r.created_at.toISOString(),
		tenants: r.tenants
	}));
}

/** Tenants the person is the only active admin of, which block disabling or deleting them. */
export async function soleAdminOf(userId: string): Promise<string[]> {
	const rows = await db()<{ name: string }[]>`
		select t.name from tenant_member m join tenant t on t.id = m.tenant_id
		where m.user_id = ${userId} and m.role = 'admin' and t.status <> 'deleted'
			and not exists (
				select 1 from tenant_member o join app_user ou on ou.id = o.user_id
				where o.tenant_id = m.tenant_id and o.role = 'admin' and o.user_id <> m.user_id and ou.disabled_at is null)`;
	return rows.map((r) => r.name);
}

async function lastPlatformAdmin(userId: string): Promise<boolean> {
	const [r] = await db()<{ n: number }[]>`
		select count(*)::int as n from app_user where platform_role = 'admin' and disabled_at is null and id <> ${userId}`;
	const [me] = await db()<
		{ platform_role: string }[]
	>`select platform_role from app_user where id = ${userId}`;
	return me?.platform_role === 'admin' && r.n === 0;
}

/** Why a person can't be disabled or deleted (the last admin of a tenant, or of the service), or null. */
export async function lastAdminProblem(userId: string): Promise<string | null> {
	const sole = await soleAdminOf(userId);
	if (sole.length)
		return `They are the only admin of ${sole.join(', ')}. Make someone else an admin first.`;
	if (await lastPlatformAdmin(userId)) return 'They are the only platform admin.';
	return null;
}

export async function setUserDisabled(
	userId: string,
	actorId: string,
	disabled: boolean
): Promise<{ ok: true } | { ok: false; reason: string }> {
	if (disabled) {
		const problem = await lastAdminProblem(userId);
		if (problem) return { ok: false, reason: problem };
	}
	try {
		await db().begin(async (tx) => {
			await tx`update app_user set disabled_at = ${disabled ? tx`now()` : null} where id = ${userId}`;
			await tx`insert into audit_log (tenant_id, actor_user_id, action, target)
				values (null, ${actorId}, ${disabled ? 'user.disabled' : 'user.enabled'}, ${`user:${userId}`})`;
		});
	} catch (e) {
		if ((e as { code?: string }).code === '23514')
			return { ok: false, reason: 'They are the last admin of a tenant or of the service.' };
		throw e;
	}
	return { ok: true };
}
