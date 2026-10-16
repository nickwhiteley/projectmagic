// Tenants as the database holds them (specs/tenants.md §4, §5): who belongs to which, which one a
// request is made in, and the audit log. Every request has a current tenant, and every project
// lookup takes it.
import type { Ctx, Membership, Project, TenantContext, TenantRole } from '#lib/core/access.ts';
import { db } from './db.ts';

export interface TenantInfo extends TenantContext {
	slug: string;
	name: string;
}

interface Row {
	id: string;
	slug: string;
	name: string;
	status: TenantContext['status'];
	role: TenantRole;
}

const toTenant = (r: Row): TenantInfo => ({
	id: String(r.id),
	slug: r.slug,
	name: r.name,
	status: r.status,
	role: r.role
});

/** The tenants a user belongs to, the one they used last first, then by name. Deleted ones are
 * not theirs any more. */
export async function tenantsOf(userId: string): Promise<TenantInfo[]> {
	const rows = await db()<Row[]>`
		select t.id, t.slug, t.name, t.status, m.role
		from tenant_member m join tenant t on t.id = m.tenant_id
		left join user_pref p on p.user_id = m.user_id
		where m.user_id = ${userId} and t.status <> 'deleted'
		order by (t.id = p.current_tenant_id) desc, lower(t.name)`;
	return rows.map(toTenant);
}

/** The tenant a request is made in: the one they used last, else the first they belong to. */
export const currentTenant = (tenants: TenantInfo[]): TenantInfo | null => tenants[0] ?? null;

/** Remember the tenant a person is working in. False if they aren't a member of it. */
export async function switchTenant(userId: string, tenantId: string): Promise<boolean> {
	const [m] = await db()`
		select 1 from tenant_member m join tenant t on t.id = m.tenant_id
		where m.user_id = ${userId} and m.tenant_id = ${tenantId} and t.status <> 'deleted'`;
	if (!m) return false;
	await db()`
		insert into user_pref (user_id, current_tenant_id) values (${userId}, ${tenantId})
		on conflict (user_id) do update set current_tenant_id = excluded.current_tenant_id`;
	return true;
}

/** What `can()` needs, from a request's locals and the project it concerns. */
export function accessCtx(
	locals: { tenant: TenantInfo | null; memberships: Membership[] },
	project?: Project | null
): Ctx {
	return { tenant: locals.tenant, project: project ?? null, memberships: locals.memberships };
}

export async function audit(
	tenantId: string | null,
	actorUserId: string | null,
	action: string,
	target: string | null,
	data: unknown = null
): Promise<void> {
	await db()`
		insert into audit_log (tenant_id, actor_user_id, action, target, data_json)
		values (${tenantId}, ${actorUserId}, ${action}, ${target}, ${data === null ? null : db().json(data as never)})`;
}
