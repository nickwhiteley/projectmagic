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

export type CreateResult = { ok: true; tenant: TenantInfo } | { ok: false; reason: string };

/** Creates a tenant with `userId` as its first admin (§3.2 step 1). `status` is `pending` when
 * sign-up waits for approval. The slug is unique and, while the tenant exists, never reused. */
export async function createTenant(
	userId: string,
	name: string,
	slug: string,
	status: 'active' | 'pending'
): Promise<CreateResult> {
	try {
		return await db().begin(async (tx) => {
			const [t] = await tx<{ id: string }[]>`
				insert into tenant (slug, name, status, created_by) values (${slug}, ${name.trim()}, ${status}, ${userId})
				returning id`;
			await tx`insert into tenant_setting (tenant_id) values (${t.id})`;
			await tx`insert into tenant_member (tenant_id, user_id, role, source) values (${t.id}, ${userId}, 'admin', 'signup')`;
			await tx`insert into audit_log (tenant_id, actor_user_id, action, target, data_json)
				values (${t.id}, ${userId}, 'tenant.created', ${`tenant:${t.id}`}, ${tx.json({ slug, status })})`;
			// Where they work next.
			await tx`insert into user_pref (user_id, current_tenant_id) values (${userId}, ${t.id})
				on conflict (user_id) do update set current_tenant_id = excluded.current_tenant_id`;
			return {
				ok: true,
				tenant: { id: String(t.id), slug, name: name.trim(), status, role: 'admin' }
			} as const;
		});
	} catch (e) {
		if ((e as { code?: string }).code === '23505')
			return { ok: false, reason: 'That address is taken. Choose another.' };
		throw e;
	}
}

export type TenantSettings = {
	aiEnabled: boolean;
	batchEditsDefault: boolean;
};

export async function tenantSettings(tenantId: string): Promise<TenantSettings> {
	const [r] = await db()<{ ai_enabled: boolean; batch_edits_default: boolean }[]>`
		select ai_enabled, batch_edits_default from tenant_setting where tenant_id = ${tenantId}`;
	return { aiEnabled: r?.ai_enabled ?? true, batchEditsDefault: r?.batch_edits_default ?? true };
}

export async function saveTenantSettings(
	tenantId: string,
	actorId: string,
	name: string,
	s: TenantSettings
): Promise<void> {
	const before = await tenantSettings(tenantId);
	await db().begin(async (tx) => {
		await tx`update tenant set name = ${name.trim()} where id = ${tenantId}`;
		await tx`insert into tenant_setting (tenant_id, ai_enabled, batch_edits_default)
			values (${tenantId}, ${s.aiEnabled}, ${s.batchEditsDefault})
			on conflict (tenant_id) do update set ai_enabled = excluded.ai_enabled,
				batch_edits_default = excluded.batch_edits_default`;
		await tx`insert into audit_log (tenant_id, actor_user_id, action, target, data_json)
			values (${tenantId}, ${actorId}, 'tenant.settings', ${`tenant:${tenantId}`},
				${tx.json({ before, after: s, name: name.trim() })})`;
	});
}

/** What a tenant admin sees on the overview (§9.2): counts now; limits arrive with tiers. */
export async function tenantUsage(tenantId: string) {
	const [r] = await db()<
		{ members: number; projects: number; installations: number; tokens: number }[]
	>`
		select
			(select count(*)::int from tenant_member where tenant_id = ${tenantId}) as members,
			(select count(*)::int from project where tenant_id = ${tenantId} and uninstalled_at is null) as projects,
			(select count(*)::int from installation where tenant_id = ${tenantId} and removed_at is null) as installations,
			coalesce((select tokens from inference_usage where scope = ${`tenant:${tenantId}`} and day = current_date), 0)::int as tokens`;
	return r;
}
