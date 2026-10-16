// Who holds which role on a project (specs/tenants.md §6, §9.2 Access page; formerly PM7's member
// list), and how a tenant decides project roles: from GitHub, or only as its admins set them.
import type { AccessMode, ProjectRole } from '#lib/core/access.ts';
import { db } from './db.ts';

export type RoleSource = 'admin' | 'manual' | 'github' | 'default' | 'none';

export interface ProjectMemberRow {
	userId: string;
	login: string;
	tenantRole: 'admin' | 'member';
	/** The role they effectively have, and where it comes from. */
	role: ProjectRole | 'none';
	source: RoleSource;
}

/** Every member of the tenant with their effective role on one project. */
export async function projectAccess(
	tenantId: string,
	projectId: string,
	access: AccessMode,
	defaultRole: 'none' | ProjectRole
): Promise<ProjectMemberRow[]> {
	const rows = await db()<
		{
			user_id: string;
			github_login: string;
			role: 'admin' | 'member';
			ms_role: ProjectRole | 'none' | null;
			ms_source: 'manual' | 'github' | null;
		}[]
	>`select m.user_id, u.github_login, m.role, ms.role as ms_role, ms.source as ms_source
		from tenant_member m join app_user u on u.id = m.user_id
		left join membership ms on ms.user_id = m.user_id and ms.project_id = ${projectId}
		where m.tenant_id = ${tenantId} order by lower(u.github_login)`;
	return rows.map((r) => {
		const base = { userId: String(r.user_id), login: r.github_login, tenantRole: r.role };
		if (r.role === 'admin')
			return { ...base, role: 'maintainer' as const, source: 'admin' as const };
		if (r.ms_role) return { ...base, role: r.ms_role, source: r.ms_source! };
		if (access === 'managed' && defaultRole !== 'none')
			return { ...base, role: defaultRole, source: 'default' as const };
		return { ...base, role: 'none' as const, source: 'none' as const };
	});
}

export type SetResult = { ok: true } | { ok: false; reason: string };

/** An admin's override of one person's role on one project, up or down. `inherit` removes the
 * override, so the role GitHub reports (or the tenant's default) applies again. */
export async function setProjectRole(
	tenantId: string,
	actorId: string,
	projectId: string,
	userId: string,
	role: ProjectRole | 'none' | 'inherit'
): Promise<SetResult> {
	const [ok] = await db()`
		select 1 from project p join tenant_member m on m.tenant_id = p.tenant_id
		where p.id = ${projectId} and p.tenant_id = ${tenantId} and m.user_id = ${userId}`;
	if (!ok) return { ok: false, reason: 'That person or project is not in this tenant.' };
	await db().begin(async (tx) => {
		if (role === 'inherit')
			await tx`delete from membership where user_id = ${userId} and project_id = ${projectId} and source = 'manual'`;
		else
			await tx`insert into membership (user_id, project_id, role, granted_by, source)
				values (${userId}, ${projectId}, ${role}, ${actorId}, 'manual')
				on conflict (user_id, project_id) do update set role = excluded.role, granted_by = excluded.granted_by,
					granted_at = now(), source = 'manual', synced_at = null`;
		await tx`insert into audit_log (tenant_id, actor_user_id, action, target, data_json)
			values (${tenantId}, ${actorId}, 'access.role', ${`project:${projectId}`}, ${tx.json({ user: userId, role })})`;
	});
	return { ok: true };
}

/** How the tenant decides roles. Moving to GitHub makes every member's derived roles due; moving to
 * managed drops them, so only what admins set (and the default) applies. */
export async function setAccessMode(
	tenantId: string,
	actorId: string,
	access: AccessMode,
	defaultRole: 'none' | 'viewer' | 'editor'
): Promise<void> {
	await db().begin(async (tx) => {
		const [before] = await tx<{ access: AccessMode; default_project_role: string }[]>`
			select access, default_project_role from tenant_setting where tenant_id = ${tenantId}`;
		await tx`insert into tenant_setting (tenant_id, access, default_project_role) values (${tenantId}, ${access}, ${defaultRole})
			on conflict (tenant_id) do update set access = excluded.access, default_project_role = excluded.default_project_role`;
		if (access === 'github')
			await tx`update tenant_member set github_synced_at = null where tenant_id = ${tenantId}`;
		else
			await tx`delete from membership where source = 'github'
				and project_id in (select id from project where tenant_id = ${tenantId})`;
		await tx`insert into audit_log (tenant_id, actor_user_id, action, target, data_json)
			values (${tenantId}, ${actorId}, 'access.mode', ${`tenant:${tenantId}`},
				${tx.json({ before: before ?? null, after: { access, defaultRole } })})`;
	});
}
