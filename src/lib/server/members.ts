// A tenant's people (specs/tenants.md §3.3, §6.4): members and their roles, leaving and removing,
// invitations, and joining by GitHub access. A tenant always keeps an active admin; the service
// checks first so it can say why, and the database refuses every other path (migration 010).
import { createHash } from 'node:crypto';
import type { ProjectRole, TenantRole } from '#lib/core/access.ts';
import { randomToken } from './crypto.ts';
import { db } from './db.ts';
import type { GitHubAccess } from './installations.ts';

const hash = (token: string) => createHash('sha256').update(token).digest('hex');

export const INVITATION_DAYS = 14;
const LAST_ADMIN = 'A tenant needs at least one active admin. Make someone else an admin first.';

const isTrigger = (e: unknown) => (e as { code?: string })?.code === '23514';

export interface MemberRow {
	userId: string;
	login: string;
	name: string | null;
	role: TenantRole;
	source: 'signup' | 'invited' | 'github';
	joinedAt: string;
	lastSeenAt: string | null;
	disabled: boolean;
	/** Projects they hold an explicit role on. */
	projects: number;
}

export async function listMembers(tenantId: string): Promise<MemberRow[]> {
	const rows = await db()<
		{
			user_id: string;
			github_login: string;
			name: string | null;
			role: TenantRole;
			source: MemberRow['source'];
			joined_at: Date;
			last_seen_at: Date | null;
			disabled_at: Date | null;
			projects: number;
		}[]
	>`select m.user_id, u.github_login, u.name, m.role, m.source, m.joined_at, m.last_seen_at, u.disabled_at,
			(select count(*)::int from membership ms join project p on p.id = ms.project_id
				where ms.user_id = m.user_id and p.tenant_id = m.tenant_id and ms.role <> 'none') as projects
		from tenant_member m join app_user u on u.id = m.user_id
		where m.tenant_id = ${tenantId} order by (m.role = 'admin') desc, lower(u.github_login)`;
	return rows.map((r) => ({
		userId: String(r.user_id),
		login: r.github_login,
		name: r.name,
		role: r.role,
		source: r.source,
		joinedAt: r.joined_at.toISOString(),
		lastSeenAt: r.last_seen_at?.toISOString() ?? null,
		disabled: !!r.disabled_at,
		projects: r.projects
	}));
}

/** Whether somebody other than `userId` is an active admin of the tenant. */
async function otherAdmin(tenantId: string, userId: string, tx = db()): Promise<boolean> {
	const [r] = await tx<{ n: number }[]>`
		select count(*)::int as n from tenant_member m join app_user u on u.id = m.user_id
		where m.tenant_id = ${tenantId} and m.role = 'admin' and u.disabled_at is null and m.user_id <> ${userId}`;
	return r.n > 0;
}

export type Result = { ok: true } | { ok: false; reason: string };

export async function setMemberRole(
	tenantId: string,
	actorId: string,
	userId: string,
	role: TenantRole
): Promise<Result> {
	const [m] = await db()<{ role: TenantRole }[]>`
		select role from tenant_member where tenant_id = ${tenantId} and user_id = ${userId}`;
	if (!m) return { ok: false, reason: 'They are not a member.' };
	if (m.role === role) return { ok: true };
	if (m.role === 'admin' && !(await otherAdmin(tenantId, userId)))
		return { ok: false, reason: LAST_ADMIN };
	try {
		await db().begin(async (tx) => {
			await tx`update tenant_member set role = ${role} where tenant_id = ${tenantId} and user_id = ${userId}`;
			await tx`insert into audit_log (tenant_id, actor_user_id, action, target, data_json)
				values (${tenantId}, ${actorId}, 'member.role', ${`user:${userId}`}, ${tx.json({ before: m.role, after: role })})`;
		});
	} catch (e) {
		if (isTrigger(e)) return { ok: false, reason: LAST_ADMIN };
		throw e;
	}
	return { ok: true };
}

/** Takes a person out of a tenant: their project roles go, and so do their pending batch edits
 * (§3.3), which pass to another author of the same project's batch if there is one, else are
 * discarded with a note in the edit log. Their edits and edit-log rows stay. */
async function leaveTenant(
	tx: ReturnType<typeof db>,
	tenantId: string,
	userId: string,
	why: 'left' | 'removed'
): Promise<void> {
	const pending = await tx<{ id: string; project_id: string; item_id: string; op: unknown }[]>`
		select e.id, e.project_id, e.item_id, e.op from pending_edit e join project p on p.id = e.project_id
		where e.user_id = ${userId} and p.tenant_id = ${tenantId}`;
	for (const e of pending) {
		const [next] = await tx<{ user_id: string }[]>`
			select user_id from pending_edit where project_id = ${e.project_id} and user_id <> ${userId}
			order by created_at limit 1`;
		if (next) await tx`update pending_edit set user_id = ${next.user_id} where id = ${e.id}`;
		else {
			await tx`delete from pending_edit where id = ${e.id}`;
			await tx`insert into edit_log (project_id, user_id, item_id, op, error)
				values (${e.project_id}, null, ${e.item_id}, 'discarded', ${`Pending edit discarded: its author ${why} the tenant.`})`;
		}
	}
	await tx`delete from membership where user_id = ${userId}
		and project_id in (select id from project where tenant_id = ${tenantId})`;
	await tx`delete from tenant_member where tenant_id = ${tenantId} and user_id = ${userId}`;
	await tx`update user_pref set current_tenant_id = null where user_id = ${userId} and current_tenant_id = ${tenantId}`;
}

/** An admin removes a member, or a member leaves (`actorId === userId`). */
export async function removeMember(
	tenantId: string,
	actorId: string,
	userId: string
): Promise<Result> {
	const [m] = await db()<{ role: TenantRole }[]>`
		select role from tenant_member where tenant_id = ${tenantId} and user_id = ${userId}`;
	if (!m) return { ok: false, reason: 'They are not a member.' };
	if (m.role === 'admin' && !(await otherAdmin(tenantId, userId)))
		return { ok: false, reason: LAST_ADMIN };
	const left = actorId === userId;
	try {
		await db().begin(async (tx) => {
			await leaveTenant(tx as never, tenantId, userId, left ? 'left' : 'removed');
			await tx`insert into audit_log (tenant_id, actor_user_id, action, target, data_json)
				values (${tenantId}, ${actorId}, ${left ? 'member.left' : 'member.removed'}, ${`user:${userId}`}, null)`;
		});
	} catch (e) {
		if (isTrigger(e)) return { ok: false, reason: LAST_ADMIN };
		throw e;
	}
	return { ok: true };
}

// --- Invitations (§3.3) ---

export interface InvitationRow {
	id: string;
	tenantId: string;
	tenantName: string;
	githubLogin: string;
	role: TenantRole;
	projectRoles: Record<string, ProjectRole>;
	createdAt: string;
	expiresAt: string;
}

type InvRow = {
	id: string;
	tenant_id: string;
	tenant_name: string;
	github_login: string;
	role: TenantRole;
	project_roles_json: Record<string, ProjectRole>;
	created_at: Date;
	expires_at: Date;
};
const toInvitation = (r: InvRow): InvitationRow => ({
	id: String(r.id),
	tenantId: String(r.tenant_id),
	tenantName: r.tenant_name,
	githubLogin: r.github_login,
	role: r.role,
	projectRoles: r.project_roles_json,
	createdAt: r.created_at.toISOString(),
	expiresAt: r.expires_at.toISOString()
});
const OPEN = `i.accepted_at is null and i.revoked_at is null and i.expires_at > now()`;

/** The open invitations a tenant has sent. */
export async function tenantInvitations(tenantId: string): Promise<InvitationRow[]> {
	const rows = await db()<InvRow[]>`
		select i.id, i.tenant_id, t.name as tenant_name, i.github_login, i.role, i.project_roles_json, i.created_at, i.expires_at
		from invitation i join tenant t on t.id = i.tenant_id
		where i.tenant_id = ${tenantId} and ${db().unsafe(OPEN)} order by i.created_at desc`;
	return rows.map(toInvitation);
}

/** The open invitations for a person, shown at their next sign-in. */
export async function invitationsFor(githubId: string): Promise<InvitationRow[]> {
	const rows = await db()<InvRow[]>`
		select i.id, i.tenant_id, t.name as tenant_name, i.github_login, i.role, i.project_roles_json, i.created_at, i.expires_at
		from invitation i join tenant t on t.id = i.tenant_id
		where i.github_id = ${githubId} and t.status <> 'deleted' and ${db().unsafe(OPEN)} order by i.created_at desc`;
	return rows.map(toInvitation);
}

export type InviteResult = { ok: true; token: string } | { ok: false; reason: string };

/** Invites a GitHub login, already checked against GitHub (`ghUser`). Held against the numeric id.
 * Another open invitation for the same person is replaced. */
export async function createInvitation(
	tenantId: string,
	actorId: string,
	ghUser: { id: number; login: string },
	role: TenantRole,
	projectRoles: Record<string, ProjectRole> = {}
): Promise<InviteResult> {
	const [already] = await db()`
		select 1 from tenant_member m join app_user u on u.id = m.user_id
		where m.tenant_id = ${tenantId} and u.github_id = ${ghUser.id}`;
	if (already) return { ok: false, reason: `${ghUser.login} is already a member.` };
	const token = randomToken(32);
	await db().begin(async (tx) => {
		await tx`update invitation set revoked_at = now()
			where tenant_id = ${tenantId} and github_id = ${ghUser.id} and accepted_at is null and revoked_at is null`;
		await tx`insert into invitation (tenant_id, github_id, github_login, role, project_roles_json, token_hash, invited_by, expires_at)
			values (${tenantId}, ${ghUser.id}, ${ghUser.login}, ${role}, ${tx.json(projectRoles)}, ${hash(token)}, ${actorId},
				now() + ${`${INVITATION_DAYS} days`}::interval)`;
		await tx`insert into audit_log (tenant_id, actor_user_id, action, target, data_json)
			values (${tenantId}, ${actorId}, 'invitation.sent', ${`github:${ghUser.login}`}, ${tx.json({ role })})`;
	});
	return { ok: true, token };
}

export async function revokeInvitation(
	tenantId: string,
	actorId: string,
	id: string
): Promise<boolean> {
	const [r] = await db()<{ github_login: string }[]>`
		update invitation set revoked_at = now()
		where id = ${id} and tenant_id = ${tenantId} and accepted_at is null and revoked_at is null returning github_login`;
	if (!r) return false;
	await db()`insert into audit_log (tenant_id, actor_user_id, action, target)
		values (${tenantId}, ${actorId}, 'invitation.revoked', ${`github:${r.github_login}`})`;
	return true;
}

/** The invitation a link's token names, so a signed-in person can be told what they are accepting. */
export async function invitationByToken(
	token: string
): Promise<(InvitationRow & { githubId: string }) | null> {
	const [r] = await db()<(InvRow & { github_id: string })[]>`
		select i.id, i.tenant_id, t.name as tenant_name, i.github_login, i.github_id, i.role, i.project_roles_json, i.created_at, i.expires_at
		from invitation i join tenant t on t.id = i.tenant_id
		where i.token_hash = ${hash(token)} and t.status <> 'deleted' and ${db().unsafe(OPEN)}`;
	return r ? { ...toInvitation(r), githubId: String(r.github_id) } : null;
}

/** Accepts an invitation as the person it was sent to: they join with its tenant role and, under
 * managed access, its project roles. */
export async function acceptInvitation(
	user: { id: string; githubId: string },
	invitationId: string
): Promise<{ ok: true; tenantId: string } | { ok: false; reason: string }> {
	return db().begin(async (tx) => {
		const [i] = await tx<
			{
				id: string;
				tenant_id: string;
				github_id: string;
				role: TenantRole;
				project_roles_json: Record<string, ProjectRole>;
				invited_by: string | null;
			}[]
		>`select i.id, i.tenant_id, i.github_id, i.role, i.project_roles_json, i.invited_by
			from invitation i join tenant t on t.id = i.tenant_id
			where i.id = ${invitationId} and t.status <> 'deleted' and ${tx.unsafe(OPEN)} for update of i`;
		if (!i) return { ok: false, reason: 'That invitation has expired or was withdrawn.' } as const;
		if (String(i.github_id) !== user.githubId)
			return { ok: false, reason: 'That invitation is for a different GitHub account.' } as const;
		await tx`insert into tenant_member (tenant_id, user_id, role, source, invited_by)
			values (${i.tenant_id}, ${user.id}, ${i.role}, 'invited', ${i.invited_by})
			on conflict (tenant_id, user_id) do nothing`;
		for (const [projectId, role] of Object.entries(i.project_roles_json))
			await tx`insert into membership (user_id, project_id, role, granted_by, source)
				select ${user.id}, p.id, ${role}, ${i.invited_by}, 'manual' from project p
				where p.id = ${projectId} and p.tenant_id = ${i.tenant_id}
				on conflict (user_id, project_id) do nothing`;
		await tx`update invitation set accepted_at = now() where id = ${i.id}`;
		await tx`insert into audit_log (tenant_id, actor_user_id, action, target, data_json)
			values (${i.tenant_id}, ${user.id}, 'member.joined', ${`user:${user.id}`}, ${tx.json({ via: 'invitation', role: i.role })})`;
		await tx`insert into user_pref (user_id, current_tenant_id) values (${user.id}, ${i.tenant_id})
			on conflict (user_id) do update set current_tenant_id = excluded.current_tenant_id`;
		return { ok: true, tenantId: String(i.tenant_id) } as const;
	});
}

// --- Joining by GitHub access (§3.3) ---

/** Active tenants that admit by GitHub access, among those whose organisation installations the
 * person's token can see. A personal account's installation admits only its owner, who claimed it. */
async function admittingTenants(visible: number[]): Promise<{ id: string; name: string }[]> {
	if (!visible.length) return [];
	return db()<{ id: string; name: string }[]>`
		select distinct t.id, t.name from installation i
		join tenant t on t.id = i.tenant_id join tenant_setting s on s.tenant_id = t.id
		where i.id in ${db()(visible)} and i.account_type = 'Organization' and i.removed_at is null
			and t.status = 'active' and s.join_by_github`;
}

/** Whether a stranger may sign in while sign-up is closed: they hold an invitation, or their GitHub
 * access reaches a tenant that admits by it (§3.1). */
export async function admitsStranger(githubId: string, gh: GitHubAccess): Promise<boolean> {
	if ((await invitationsFor(githubId)).length) return true;
	return (await admittingTenants(await gh.visibleInstallationIds().catch(() => []))).length > 0;
}

/** Adds the person, as a member, to every tenant that admits by GitHub access and that they can
 * reach and are not yet in. */
export async function joinByGithub(userId: string, gh: GitHubAccess): Promise<string[]> {
	const joined: string[] = [];
	for (const t of await admittingTenants(await gh.visibleInstallationIds().catch(() => []))) {
		const [added] = await db()`
			insert into tenant_member (tenant_id, user_id, role, source) values (${t.id}, ${userId}, 'member', 'github')
			on conflict (tenant_id, user_id) do nothing returning user_id`;
		if (!added) continue;
		await db()`insert into audit_log (tenant_id, actor_user_id, action, target, data_json)
			values (${t.id}, ${userId}, 'member.joined', ${`user:${userId}`}, ${db().json({ via: 'github', role: 'member' })})`;
		joined.push(String(t.id));
	}
	return joined;
}

export async function setJoinByGithub(
	tenantId: string,
	actorId: string,
	on: boolean
): Promise<void> {
	await db().begin(async (tx) => {
		await tx`insert into tenant_setting (tenant_id, join_by_github) values (${tenantId}, ${on})
			on conflict (tenant_id) do update set join_by_github = excluded.join_by_github`;
		await tx`insert into audit_log (tenant_id, actor_user_id, action, target, data_json)
			values (${tenantId}, ${actorId}, 'tenant.join_by_github', ${`tenant:${tenantId}`}, ${tx.json({ on })})`;
	});
}

/** A person deleting their own account (§8.4): their roles and tokens go, and their edit-log rows
 * stay without them. Refused while they are the last admin of a tenant or of the service. */
export async function deleteAccount(userId: string, problem: string | null): Promise<Result> {
	if (problem) return { ok: false, reason: problem };
	try {
		await db().begin(async (tx) => {
			const tenants = await tx<
				{ tenant_id: string }[]
			>`select tenant_id from tenant_member where user_id = ${userId}`;
			for (const t of tenants) await leaveTenant(tx as never, String(t.tenant_id), userId, 'left');
			await tx`delete from app_user where id = ${userId}`;
		});
	} catch (e) {
		if (isTrigger(e)) return { ok: false, reason: LAST_ADMIN };
		throw e;
	}
	return { ok: true };
}
