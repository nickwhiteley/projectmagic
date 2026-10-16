// A tenant's plan, read from the database (specs/tenants.md §7): its tier, its limits and flags
// with overrides applied, and what it uses. No SvelteKit imports and the database is passed in, so
// the sync can apply the project limit from a script too.
import {
	effectiveTier,
	projectsOverLimit,
	resolveFlag,
	resolveQuota,
	type FlagDef,
	type Quota,
	type Tier,
	type TierQuotas
} from '#lib/core/plans.ts';
import type postgres from 'postgres';

type Sql = postgres.Sql;

export interface PlanData {
	tiers: (Tier & { name: string })[];
	tierQuotas: TierQuotas;
	flags: Map<string, FlagDef & { label: string }>;
	defaultTierId: string | null;
}

export async function loadPlanData(sql: Sql): Promise<PlanData> {
	const [tiers, quotas, flags, setting] = await Promise.all([
		sql<{ id: string; name: string; position: number; enabled: boolean }[]>`
			select id, name, position, enabled from tier order by position`,
		sql<
			{ tier_id: string; quota: string; value: string | null }[]
		>`select tier_id, quota, value from tier_quota`,
		sql<{ key: string; label: string; enabled: boolean; min_tier_id: string | null }[]>`
			select key, label, enabled, min_tier_id from flag`,
		sql<
			{ value_json: unknown }[]
		>`select value_json from platform_setting where key = 'default_tier'`
	]);
	const tierQuotas: TierQuotas = new Map();
	for (const r of quotas) {
		const m = tierQuotas.get(String(r.tier_id)) ?? new Map<string, number | null>();
		m.set(r.quota, r.value === null ? null : Number(r.value));
		tierQuotas.set(String(r.tier_id), m);
	}
	return {
		tiers: tiers.map((t) => ({
			id: String(t.id),
			name: t.name,
			position: t.position,
			enabled: t.enabled
		})),
		tierQuotas,
		flags: new Map(
			flags.map((f) => [
				f.key,
				{
					label: f.label,
					enabled: f.enabled,
					minTierId: f.min_tier_id === null ? null : String(f.min_tier_id)
				}
			])
		),
		defaultTierId: typeof setting[0]?.value_json === 'string' ? setting[0].value_json : null
	};
}

export interface TenantPlan {
	tier: { id: string; name: string } | null;
	/** The tier the tenant pays for, if an override puts it on another. */
	paidTierId: string | null;
	overridden: boolean;
	/** Limits; null is unlimited. */
	limits: Record<Quota, number | null>;
	flags: Record<string, boolean>;
}

/** What `declared` supplies where no tier or override sets a quota: the deployment's own limits. */
export type Declared = Partial<Record<Quota, number | null>>;

export async function tenantPlan(
	sql: Sql,
	tenantId: string,
	declared: Declared = {},
	data?: PlanData
): Promise<TenantPlan> {
	const d = data ?? (await loadPlanData(sql));
	const [t] = await sql<{ tier_id: string | null; tier_override_id: string | null }[]>`
		select tier_id, tier_override_id from tenant where id = ${tenantId}`;
	const [qo, fo] = await Promise.all([
		sql<{ quota: string; value: string | null; expires_at: Date | null }[]>`
			select quota, value, expires_at from tenant_quota_override where tenant_id = ${tenantId}`,
		sql<{ flag: string; on_: boolean; expires_at: Date | null }[]>`
			select flag, on_, expires_at from tenant_flag_override where tenant_id = ${tenantId}`
	]);
	const tier = effectiveTier(
		d.tiers,
		t?.tier_id ? String(t.tier_id) : null,
		t?.tier_override_id ? String(t.tier_override_id) : null
	);
	const limits = {} as Record<Quota, number | null>;
	for (const quota of ['members', 'projects', 'ai_tokens_daily'] as const) {
		const o = qo.find((r) => r.quota === quota);
		limits[quota] = resolveQuota(
			quota,
			d.tiers,
			tier,
			d.tierQuotas,
			o
				? {
						value: o.value === null ? null : Number(o.value),
						expiresAt: o.expires_at?.toISOString() ?? null
					}
				: null,
			declared[quota] ?? null
		);
	}
	const flags: Record<string, boolean> = {};
	for (const [key, def] of d.flags) {
		const o = fo.find((r) => r.flag === key);
		flags[key] = resolveFlag(
			def,
			d.tiers,
			tier,
			o ? { on: o.on_, expiresAt: o.expires_at?.toISOString() ?? null } : null
		);
	}
	return {
		tier: tier ? { id: tier.id, name: d.tiers.find((x) => x.id === tier.id)?.name ?? '' } : null,
		paidTierId: t?.tier_id ? String(t.tier_id) : null,
		overridden: !!t?.tier_override_id,
		limits,
		flags
	};
}

export interface Usage {
	members: number;
	projects: number;
	/** Items inferred plus questions asked today, by the tenant and each of its members. */
	aiTokensToday: number;
}

export async function tenantUsage(sql: Sql, tenantId: string): Promise<Usage> {
	const [r] = await sql<{ members: number; projects: number; tokens: string }[]>`
		select
			(select count(*)::int from tenant_member where tenant_id = ${tenantId}) as members,
			(select count(*)::int from project where tenant_id = ${tenantId} and uninstalled_at is null and not over_limit) as projects,
			(select coalesce(sum(tokens), 0) from inference_usage where day = current_date and (
				scope = ${`tenant:${tenantId}`}
				or scope in (select 'ask:' || user_id from tenant_member where tenant_id = ${tenantId}))) as tokens`;
	return { members: r.members, projects: r.projects, aiTokensToday: Number(r.tokens) };
}

/** Marks the projects beyond the plan's limit, leaving the pinned and the oldest in (§7.2).
 * Nothing is deleted; an over-limit project just stops syncing and is listed as over the plan. */
export async function applyProjectLimit(
	sql: Sql,
	tenantId: string,
	data?: PlanData
): Promise<string[]> {
	const plan = await tenantPlan(sql, tenantId, {}, data);
	const projects = await sql<{ id: string; pinned: boolean }[]>`
		select id, pinned from project where tenant_id = ${tenantId} and uninstalled_at is null`;
	const over = projectsOverLimit(
		projects.map((p) => ({ id: String(p.id), pinned: p.pinned })),
		plan.limits.projects
	);
	await sql`update project set over_limit = (id = any(${over.map(Number)}))
		where tenant_id = ${tenantId} and uninstalled_at is null and over_limit <> (id = any(${over.map(Number)}))`;
	return over;
}
