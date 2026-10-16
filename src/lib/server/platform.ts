// Running the service (specs/tenants.md §6.3, §8): the sign-up mode, and moving a tenant between
// pending, active, suspended and deleted. Every action is written to the audit log with who, what,
// the target and the before and after.
import { PURGE_AFTER_DAYS, parseSignup, type SignupMode } from '#lib/core/tenants.ts';
import type { TenantStatus } from '#lib/core/access.ts';
import { db } from './db.ts';
import { audit } from './tenants.ts';

export async function getSignup(): Promise<SignupMode> {
	const [r] = await db()<{ value_json: unknown }[]>`
		select value_json from platform_setting where key = 'signup'`.catch(() => []);
	return parseSignup(r?.value_json);
}

export async function setSignup(mode: SignupMode, actorId: string): Promise<void> {
	const before = await getSignup();
	await db()`
		insert into platform_setting (key, value_json, updated_by) values ('signup', ${db().json(mode)}, ${actorId})
		on conflict (key) do update set value_json = excluded.value_json, updated_by = excluded.updated_by, updated_at = now()`;
	await audit(null, actorId, 'platform.signup', 'platform_setting:signup', { before, after: mode });
}

export interface TenantSummary {
	id: string;
	slug: string;
	name: string;
	status: TenantStatus;
	statusReason: string | null;
	createdAt: string;
	deletedAt: string | null;
	members: number;
	installations: number;
	projects: number;
}

const COUNTS = `t.id, t.slug, t.name, t.status, t.status_reason, t.created_at, t.deleted_at,
	(select count(*)::int from tenant_member m where m.tenant_id = t.id) as members,
	(select count(*)::int from installation i where i.tenant_id = t.id and i.removed_at is null) as installations,
	(select count(*)::int from project p where p.tenant_id = t.id and p.uninstalled_at is null) as projects`;

type CountRow = {
	id: string;
	slug: string;
	name: string;
	status: TenantStatus;
	status_reason: string | null;
	created_at: Date;
	deleted_at: Date | null;
	members: number;
	installations: number;
	projects: number;
};
const toSummary = (r: CountRow): TenantSummary => ({
	id: String(r.id),
	slug: r.slug,
	name: r.name,
	status: r.status,
	statusReason: r.status_reason,
	createdAt: r.created_at.toISOString(),
	deletedAt: r.deleted_at?.toISOString() ?? null,
	members: r.members,
	installations: r.installations,
	projects: r.projects
});

/** Metadata only: counts, never a tenant's content (§6.3). */
export async function listTenants(search = ''): Promise<TenantSummary[]> {
	const like = `%${search.trim().replace(/[\\%_]/g, '\\$&')}%`;
	const rows = await db()<CountRow[]>`
		select ${db().unsafe(COUNTS)} from tenant t
		where t.slug ilike ${like} or t.name ilike ${like}
		order by (t.status = 'pending') desc, t.created_at desc limit 200`;
	return rows.map(toSummary);
}

export async function tenantSummary(id: string): Promise<TenantSummary | null> {
	if (!/^\d+$/.test(id)) return null;
	const [r] = await db()<
		CountRow[]
	>`select ${db().unsafe(COUNTS)} from tenant t where t.id = ${id}`;
	return r ? toSummary(r) : null;
}

export async function platformOverview() {
	const [c] = await db()<
		{
			pending: number;
			active: number;
			suspended: number;
			deleted: number;
			week: number;
			unclaimed: number;
			stale: number;
		}[]
	>`select
		count(*) filter (where status = 'pending')::int as pending,
		count(*) filter (where status = 'active')::int as active,
		count(*) filter (where status = 'suspended')::int as suspended,
		count(*) filter (where status = 'deleted')::int as deleted,
		count(*) filter (where created_at > now() - interval '7 days')::int as week,
		(select count(*)::int from installation where tenant_id is null and removed_at is null) as unclaimed,
		(select count(*)::int from installation where tenant_id is null and removed_at is null and created_at < now() - interval '7 days') as stale
		from tenant`;
	return c;
}

export type TenantAction = 'approve' | 'suspend' | 'restore' | 'delete' | 'undelete';

const MOVES: Record<TenantAction, { from: TenantStatus[]; to: TenantStatus }> = {
	approve: { from: ['pending'], to: 'active' },
	suspend: { from: ['active'], to: 'suspended' },
	restore: { from: ['suspended'], to: 'active' },
	delete: { from: ['pending', 'active', 'suspended'], to: 'deleted' },
	undelete: { from: ['deleted'], to: 'active' }
};

export type MoveResult = { ok: true; detached: number[] } | { ok: false; reason: string };

/** Moves a tenant to another status, as `actorId`, and records it. Deleting detaches the tenant's
 * installations and marks its projects uninstalled; the caller uninstalls the App on GitHub from
 * the returned installation ids. Undeleting is allowed until the purge (§8.4). */
export async function moveTenant(
	tenantId: string,
	action: TenantAction,
	actorId: string,
	reason: string | null = null
): Promise<MoveResult> {
	const move = MOVES[action];
	if (action === 'suspend' && !reason?.trim())
		return { ok: false, reason: 'Give a reason for suspending.' };
	return db().begin(async (tx) => {
		const [t] = await tx<
			{ status: TenantStatus }[]
		>`select status from tenant where id = ${tenantId} for update`;
		if (!t) return { ok: false, reason: 'No such tenant.' } as const;
		if (!move.from.includes(t.status))
			return { ok: false, reason: `A ${t.status} tenant cannot be ${action}d.` } as const;
		await tx`update tenant set status = ${move.to},
			status_reason = ${action === 'suspend' ? reason!.trim() : null},
			deleted_at = ${action === 'delete' ? tx`now()` : null} where id = ${tenantId}`;
		let detached: number[] = [];
		if (action === 'delete') {
			detached = (
				await tx<{ id: string }[]>`
					update installation set tenant_id = null, claimed_by = null, claimed_at = null
					where tenant_id = ${tenantId} returning id`
			).map((r) => Number(r.id));
			await tx`update project set uninstalled_at = coalesce(uninstalled_at, now()) where tenant_id = ${tenantId}`;
		}
		await tx`insert into audit_log (tenant_id, actor_user_id, action, target, data_json)
			values (${tenantId}, ${actorId}, ${`tenant.${action}`}, ${`tenant:${tenantId}`},
				${tx.json({ before: t.status, after: move.to, reason: reason?.trim() || null, detached })})`;
		return { ok: true, detached } as const;
	});
}

/** The cron's job (§8.4): a tenant deleted more than 30 days ago loses its real data. Its projects
 * go (and with them their edit logs, memberships and pending edits), then its members, settings and
 * audit log. */
export async function purgeDeletedTenants(): Promise<number> {
	const due = await db()<{ id: string }[]>`
		select id from tenant where status = 'deleted'
		and deleted_at < now() - ${`${PURGE_AFTER_DAYS} days`}::interval`;
	for (const t of due)
		await db().begin(async (tx) => {
			await tx`delete from project where tenant_id = ${t.id}`;
			await tx`delete from audit_log where tenant_id = ${t.id}`;
			await tx`delete from tenant where id = ${t.id}`;
		});
	return due.length;
}

export interface AuditRow {
	id: string;
	at: string;
	actor: string | null;
	tenant: string | null;
	action: string;
	target: string | null;
	data: unknown;
}

/** Newest first; a tenant's own, or the whole service's. */
export async function auditLog(tenantId: string | null, limit = 200): Promise<AuditRow[]> {
	const rows = await db()<
		{
			id: string;
			at: Date;
			actor: string | null;
			tenant: string | null;
			action: string;
			target: string | null;
			data_json: unknown;
		}[]
	>`select a.id, a.at, u.github_login as actor, t.name as tenant, a.action, a.target, a.data_json
		from audit_log a left join app_user u on u.id = a.actor_user_id left join tenant t on t.id = a.tenant_id
		where ${tenantId === null ? db()`true` : db()`a.tenant_id = ${tenantId}`}
		order by a.at desc, a.id desc limit ${limit}`;
	return rows.map((r) => ({
		id: String(r.id),
		at: r.at.toISOString(),
		actor: r.actor,
		tenant: r.tenant,
		action: r.action,
		target: r.target,
		data: r.data_json
	}));
}
