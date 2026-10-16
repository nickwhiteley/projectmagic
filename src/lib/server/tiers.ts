// Platform admins' control of tiers, quotas, flags, prices and exceptions (specs/tenants.md §7.1,
// §9.3). Tiers are data, never named in code. Changing a tier's limits applies to its tenants at once;
// going down takes nothing away (§7.2): only adding more is refused, and projects over the limit stop
// syncing. Every change is written to the audit log with the before and after.
import { QUOTAS, type Quota } from '#lib/core/plans.ts';
import { db } from './db.ts';
import { forgetAiCache } from './plans.ts';
import { applyProjectLimit, loadPlanData, type PlanData } from './plan-queries.ts';

type Sql = ReturnType<typeof db>;

const audit = (
	tx: Sql,
	actor: string,
	action: string,
	target: string,
	data: unknown,
	tenantId: string | null = null
) =>
	tx`insert into audit_log (tenant_id, actor_user_id, action, target, data_json)
		values (${tenantId}, ${actor}, ${action}, ${target}, ${tx.json(data as never)})`;

export type Done = { ok: true } | { ok: false; reason: string };

/** After a change to limits: every tenant's project limit applies at once, and AI answers are asked again. */
export async function reapplyAll(): Promise<void> {
	forgetAiCache();
	const data = await loadPlanData(db());
	for (const t of await db()<{ id: string }[]>`select id from tenant where status <> 'deleted'`)
		await applyProjectLimit(db(), String(t.id), data);
}

export interface TierView {
	id: string;
	name: string;
	position: number;
	enabled: boolean;
	isDefault: boolean;
	tenants: number;
	/** `undefined` inherits; `null` is explicitly unlimited. */
	quotas: Record<Quota, number | null | undefined>;
	prices: { interval: 'month' | 'year'; amountMinor: number; currency: string; active: boolean }[];
}

export interface TiersView {
	tiers: TierView[];
	flags: { key: string; label: string; enabled: boolean; minTierId: string | null }[];
	defaultTierId: string | null;
}

export async function tiersView(): Promise<TiersView> {
	const data: PlanData = await loadPlanData(db());
	const counts = await db()<{ tier_id: string; n: number }[]>`
		select coalesce(tier_override_id, tier_id) as tier_id, count(*)::int as n from tenant where status <> 'deleted' group by 1`;
	const prices = await db()<
		{
			tier_id: string;
			interval: 'month' | 'year';
			amount_minor: number;
			currency: string;
			active: boolean;
		}[]
	>`
		select tier_id, interval, amount_minor, currency, active from billing_price where provider = 'stub' order by interval`;
	return {
		defaultTierId: data.defaultTierId,
		flags: [...data.flags].map(([key, f]) => ({
			key,
			label: f.label,
			enabled: f.enabled,
			minTierId: f.minTierId
		})),
		tiers: data.tiers.map((t) => {
			const rows = data.tierQuotas.get(t.id);
			return {
				id: t.id,
				name: t.name,
				position: t.position,
				enabled: t.enabled,
				isDefault: t.id === data.defaultTierId,
				tenants: counts.find((c) => String(c.tier_id) === t.id)?.n ?? 0,
				quotas: Object.fromEntries(
					QUOTAS.map((q) => [q, rows?.has(q) ? rows.get(q) : undefined])
				) as TierView['quotas'],
				prices: prices
					.filter((p) => String(p.tier_id) === t.id)
					.map((p) => ({
						interval: p.interval,
						amountMinor: p.amount_minor,
						currency: p.currency,
						active: p.active
					}))
			};
		})
	};
}

export async function createTier(actor: string, name: string): Promise<Done> {
	const n = name.trim();
	if (n.length < 1 || n.length > 40)
		return { ok: false, reason: 'Give the tier a name of up to 40 characters.' };
	await db().begin(async (tx) => {
		const [t] = await tx<{ id: string }[]>`
			insert into tier (name, position) values (${n}, coalesce((select max(position) from tier), 0) + 1) returning id`;
		await audit(tx as never, actor, 'tier.created', `tier:${t.id}`, { name: n });
	});
	return { ok: true };
}

export async function updateTier(
	actor: string,
	id: string,
	name: string,
	enabled: boolean
): Promise<Done> {
	const n = name.trim();
	if (!n || n.length > 40)
		return { ok: false, reason: 'Give the tier a name of up to 40 characters.' };
	const [def] = await db()<
		{ value_json: unknown }[]
	>`select value_json from platform_setting where key = 'default_tier'`;
	if (!enabled && def?.value_json === id)
		return {
			ok: false,
			reason: 'The default tier cannot be disabled. Choose another default first.'
		};
	await db().begin(async (tx) => {
		const [before] = await tx<
			{ name: string; enabled: boolean }[]
		>`select name, enabled from tier where id = ${id}`;
		await tx`update tier set name = ${n}, enabled = ${enabled} where id = ${id}`;
		await audit(tx as never, actor, 'tier.updated', `tier:${id}`, {
			before,
			after: { name: n, enabled }
		});
	});
	return { ok: true };
}

/** Swaps a tier with its neighbour in the order. */
export async function moveTier(actor: string, id: string, dir: 'up' | 'down'): Promise<void> {
	await db().begin(async (tx) => {
		const all = await tx<
			{ id: string; position: number }[]
		>`select id, position from tier order by position for update`;
		const i = all.findIndex((t) => String(t.id) === id);
		const j = dir === 'up' ? i - 1 : i + 1;
		if (i < 0 || j < 0 || j >= all.length) return;
		await tx`update tier set position = ${all[j].position} where id = ${all[i].id}`;
		await tx`update tier set position = ${all[i].position} where id = ${all[j].id}`;
		await audit(tx as never, actor, 'tier.moved', `tier:${id}`, { dir });
	});
	await reapplyAll();
}

/** `value`: a number sets the limit, 'unlimited' sets an explicit unlimited, 'inherit' removes the row. */
export async function setTierQuota(
	actor: string,
	tierId: string,
	quota: string,
	value: string
): Promise<Done> {
	if (!(QUOTAS as readonly string[]).includes(quota))
		return { ok: false, reason: 'Unknown quota.' };
	const v = value.trim().toLowerCase() || 'inherit';
	if (v !== 'inherit' && v !== 'unlimited' && !/^\d{1,12}$/.test(v))
		return { ok: false, reason: 'Enter a whole number, “unlimited”, or leave blank to inherit.' };
	await db().begin(async (tx) => {
		const [before] = await tx<
			{ value: string | null }[]
		>`select value from tier_quota where tier_id = ${tierId} and quota = ${quota}`;
		if (v === 'inherit' || v === '')
			await tx`delete from tier_quota where tier_id = ${tierId} and quota = ${quota}`;
		else
			await tx`insert into tier_quota (tier_id, quota, value) values (${tierId}, ${quota}, ${v === 'unlimited' ? null : Number(v)})
				on conflict (tier_id, quota) do update set value = excluded.value`;
		await audit(tx as never, actor, 'tier.quota', `tier:${tierId}`, {
			quota,
			before: before ? before.value : 'inherit',
			after: v
		});
	});
	await reapplyAll();
	return { ok: true };
}

export async function setFlag(
	actor: string,
	key: string,
	enabled: boolean,
	minTierId: string | null
): Promise<Done> {
	await db().begin(async (tx) => {
		const [before] = await tx`select enabled, min_tier_id from flag where key = ${key}`;
		await tx`update flag set enabled = ${enabled}, min_tier_id = ${minTierId} where key = ${key}`;
		await audit(tx as never, actor, 'flag.updated', `flag:${key}`, {
			before,
			after: { enabled, minTierId }
		});
	});
	await reapplyAll();
	return { ok: true };
}

/** A price for a tier and interval. Blank switches it off: nobody moves, but it can't be bought. */
export async function setPrice(
	actor: string,
	tierId: string,
	interval: 'month' | 'year',
	amount: string,
	currency = 'GBP'
): Promise<Done> {
	const a = amount.trim();
	await db().begin(async (tx) => {
		if (a === '') {
			await tx`update billing_price set active = false where tier_id = ${tierId} and interval = ${interval} and provider = 'stub'`;
			await audit(tx as never, actor, 'price.off', `tier:${tierId}`, { interval });
			return;
		}
		await tx`insert into billing_price (tier_id, interval, provider, amount_minor, currency, active)
			values (${tierId}, ${interval}, 'stub', ${a}, ${currency}, true)
			on conflict (tier_id, interval, provider) do update set amount_minor = excluded.amount_minor, currency = excluded.currency, active = true`;
		await audit(tx as never, actor, 'price.set', `tier:${tierId}`, {
			interval,
			amountMinor: Number(a),
			currency
		});
	});
	return { ok: true };
}

export async function setDefaultTier(actor: string, tierId: string): Promise<Done> {
	const [t] = await db()<{ enabled: boolean }[]>`select enabled from tier where id = ${tierId}`;
	if (!t?.enabled) return { ok: false, reason: 'Choose an enabled tier.' };
	await db().begin(async (tx) => {
		const [before] = await tx<
			{ value_json: unknown }[]
		>`select value_json from platform_setting where key = 'default_tier'`;
		await tx`insert into platform_setting (key, value_json, updated_by) values ('default_tier', ${tx.json(tierId)}, ${actor})
			on conflict (key) do update set value_json = excluded.value_json, updated_by = excluded.updated_by, updated_at = now()`;
		await audit(tx as never, actor, 'platform.default_tier', 'platform_setting:default_tier', {
			before: before?.value_json ?? null,
			after: tierId
		});
	});
	return { ok: true };
}

// --- One tenant's exceptions ---

/** Puts a tenant on another tier without payment (a trial, a friend, the owner's own), or back. */
export async function setTierOverride(
	actor: string,
	tenantId: string,
	tierId: string | null
): Promise<Done> {
	await db().begin(async (tx) => {
		const [before] = await tx<
			{ tier_override_id: string | null }[]
		>`select tier_override_id from tenant where id = ${tenantId}`;
		await tx`update tenant set tier_override_id = ${tierId} where id = ${tenantId}`;
		await audit(
			tx as never,
			actor,
			'tenant.tier_override',
			`tenant:${tenantId}`,
			{ before: before?.tier_override_id ?? null, after: tierId },
			tenantId
		);
	});
	forgetAiCache(tenantId);
	await applyProjectLimit(db(), tenantId);
	return { ok: true };
}

export async function setQuotaOverride(
	actor: string,
	tenantId: string,
	quota: string,
	value: string,
	reason: string,
	expires: string
): Promise<Done> {
	if (!(QUOTAS as readonly string[]).includes(quota))
		return { ok: false, reason: 'Unknown quota.' };
	const v = value.trim().toLowerCase();
	const remove = v === '' || v === 'remove';
	if (!remove && v !== 'unlimited' && !/^\d{1,12}$/.test(v))
		return { ok: false, reason: 'Enter a whole number, “unlimited”, or “remove”.' };
	if (!remove && !reason.trim()) return { ok: false, reason: 'Give a reason.' };
	const expiresAt = expires ? new Date(expires) : null;
	if (expiresAt && Number.isNaN(expiresAt.getTime()))
		return { ok: false, reason: 'That expiry is not a date.' };
	await db().begin(async (tx) => {
		const [before] =
			await tx`select value, expires_at from tenant_quota_override where tenant_id = ${tenantId} and quota = ${quota}`;
		if (remove) {
			await tx`delete from tenant_quota_override where tenant_id = ${tenantId} and quota = ${quota}`;
			await audit(
				tx as never,
				actor,
				'tenant.quota_override_removed',
				`tenant:${tenantId}`,
				{ quota, before },
				tenantId
			);
			return;
		}
		await tx`insert into tenant_quota_override (tenant_id, quota, value, reason, expires_at, set_by)
			values (${tenantId}, ${quota}, ${v === 'unlimited' ? null : Number(v)}, ${reason.trim()}, ${expiresAt}, ${actor})
			on conflict (tenant_id, quota) do update set value = excluded.value, reason = excluded.reason,
				expires_at = excluded.expires_at, set_by = excluded.set_by, set_at = now()`;
		await audit(
			tx as never,
			actor,
			'tenant.quota_override',
			`tenant:${tenantId}`,
			{ quota, before, after: v, reason: reason.trim(), expiresAt },
			tenantId
		);
	});
	forgetAiCache(tenantId);
	await applyProjectLimit(db(), tenantId);
	return { ok: true };
}

export async function setFlagOverride(
	actor: string,
	tenantId: string,
	flag: string,
	state: 'on' | 'off' | 'remove',
	reason: string,
	expires: string
): Promise<Done> {
	const expiresAt = expires ? new Date(expires) : null;
	if (expiresAt && Number.isNaN(expiresAt.getTime()))
		return { ok: false, reason: 'That expiry is not a date.' };
	if (state !== 'remove' && !reason.trim()) return { ok: false, reason: 'Give a reason.' };
	await db().begin(async (tx) => {
		if (state === 'remove')
			await tx`delete from tenant_flag_override where tenant_id = ${tenantId} and flag = ${flag}`;
		else
			await tx`insert into tenant_flag_override (tenant_id, flag, on_, reason, expires_at, set_by)
				values (${tenantId}, ${flag}, ${state === 'on'}, ${reason.trim()}, ${expiresAt}, ${actor})
				on conflict (tenant_id, flag) do update set on_ = excluded.on_, reason = excluded.reason,
					expires_at = excluded.expires_at, set_by = excluded.set_by, set_at = now()`;
		await audit(
			tx as never,
			actor,
			'tenant.flag_override',
			`tenant:${tenantId}`,
			{ flag, state, reason: reason.trim(), expiresAt },
			tenantId
		);
	});
	forgetAiCache(tenantId);
	return { ok: true };
}

export interface TenantOverrides {
	tierOverrideId: string | null;
	tierId: string | null;
	quotas: { quota: string; value: number | null; reason: string; expiresAt: string | null }[];
	flags: { flag: string; on: boolean; reason: string; expiresAt: string | null }[];
}

export async function tenantOverrides(tenantId: string): Promise<TenantOverrides> {
	const [t] = await db()<{ tier_id: string | null; tier_override_id: string | null }[]>`
		select tier_id, tier_override_id from tenant where id = ${tenantId}`;
	const [q, f] = await Promise.all([
		db()<{ quota: string; value: string | null; reason: string; expires_at: Date | null }[]>`
			select quota, value, reason, expires_at from tenant_quota_override where tenant_id = ${tenantId} order by quota`,
		db()<{ flag: string; on_: boolean; reason: string; expires_at: Date | null }[]>`
			select flag, on_, reason, expires_at from tenant_flag_override where tenant_id = ${tenantId} order by flag`
	]);
	return {
		tierId: t?.tier_id ? String(t.tier_id) : null,
		tierOverrideId: t?.tier_override_id ? String(t.tier_override_id) : null,
		quotas: q.map((r) => ({
			quota: r.quota,
			value: r.value === null ? null : Number(r.value),
			reason: r.reason,
			expiresAt: r.expires_at?.toISOString() ?? null
		})),
		flags: f.map((r) => ({
			flag: r.flag,
			on: r.on_,
			reason: r.reason,
			expiresAt: r.expires_at?.toISOString() ?? null
		}))
	};
}
