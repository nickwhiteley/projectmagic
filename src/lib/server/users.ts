// Who may sign in (spec §11.1): only GitHub accounts with an app_user row. The first comes from
// BOOTSTRAP_ADMIN_GITHUB_LOGIN, as an administrator, and only while no administrator exists.
import { BOOTSTRAP_ADMIN_GITHUB_LOGIN, TOKEN_ENCRYPTION_KEY } from '$app/env/private';
import type { Membership, User } from '#lib/core/access.ts';
import { encrypt } from './crypto.ts';
import { db } from './db.ts';
import type { GitHubUser, UserTokens } from './github-app.ts';

export interface SessionUser extends User {
	githubLogin: string;
	name: string | null;
}

interface UserRow {
	id: string;
	github_login: string;
	name: string | null;
	system_role: 'admin' | 'member';
	disabled_at: Date | null;
}

const toUser = (r: UserRow): SessionUser => ({
	id: String(r.id),
	githubLogin: r.github_login,
	name: r.name,
	systemRole: r.system_role,
	disabledAt: r.disabled_at?.toISOString() ?? null
});

export async function userById(id: string): Promise<SessionUser | null> {
	const [r] = await db()<UserRow[]>`
		select id, github_login, name, system_role, disabled_at from app_user where id = ${id}`;
	return r ? toUser(r) : null;
}

/** The signed-in user and their memberships in one round trip: every request needs both. */
export async function sessionUser(
	id: string
): Promise<{ user: SessionUser; memberships: Membership[] } | null> {
	const [r] = await db()<
		(UserRow & { memberships: { project_id: string; role: Membership['role'] }[] })[]
	>`
		select u.id, u.github_login, u.name, u.system_role, u.disabled_at,
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

/** After GitHub has said who they are: find their row, or create the bootstrap administrator. */
export async function signIn(gh: GitHubUser, tokens: UserTokens): Promise<SignInResult> {
	const sealed = tokens.refreshToken ? encrypt(tokens.refreshToken, TOKEN_ENCRYPTION_KEY) : null;
	return db().begin(async (tx) => {
		let [row] = await tx<UserRow[]>`
			update app_user
			set github_login = ${gh.login}, name = ${gh.name},
				refresh_token_enc = coalesce(${sealed}, refresh_token_enc),
				refresh_token_expires_at = coalesce(${tokens.refreshExpiresAt}, refresh_token_expires_at)
			where github_id = ${gh.id}
			returning id, github_login, name, system_role, disabled_at`;
		if (!row) {
			const bootstrap = BOOTSTRAP_ADMIN_GITHUB_LOGIN?.toLowerCase() === gh.login.toLowerCase();
			// Serialise concurrent first sign-ins, so only one bootstrap administrator is made.
			await tx`lock table app_user in share row exclusive mode`;
			const [{ admins }] = await tx<{ admins: number }[]>`
				select count(*)::int as admins from app_user where system_role = 'admin'`;
			if (!bootstrap || admins > 0) return { ok: false, reason: 'not-invited' } as const;
			[row] = await tx<UserRow[]>`
				insert into app_user (github_id, github_login, name, system_role, refresh_token_enc, refresh_token_expires_at)
				values (${gh.id}, ${gh.login}, ${gh.name}, 'admin', ${sealed}, ${tokens.refreshExpiresAt})
				returning id, github_login, name, system_role, disabled_at`;
		}
		if (row.disabled_at) return { ok: false, reason: 'disabled' } as const;
		return { ok: true, user: toUser(row) } as const;
	});
}
