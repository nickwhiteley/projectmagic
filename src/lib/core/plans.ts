// Tiers, quotas and flags (specs/tenants.md §7). Resolution is plinth's, as pure functions: a
// platform admin sets tiers as data, and these decide what a tenant gets. Nothing here names a tier.

export const QUOTAS = ['members', 'projects', 'ai_tokens_daily'] as const;
export type Quota = (typeof QUOTAS)[number];

export const QUOTA_LABEL: Record<Quota, string> = {
	members: 'Members',
	projects: 'Projects',
	ai_tokens_daily: 'AI tokens a day'
};

export interface Tier {
	id: string;
	/** Higher is a higher tier. */
	position: number;
	enabled: boolean;
}

/** `null` is an explicit "unlimited"; a missing key inherits from the nearest lower tier with one. */
export type TierQuotas = Map<string, Map<string, number | null>>;

export interface QuotaOverride {
	value: number | null;
	expiresAt: string | null;
}

export interface FlagDef {
	enabled: boolean;
	/** The lowest tier that includes it; null is every tier. */
	minTierId: string | null;
}

export interface FlagOverride {
	on: boolean;
	expiresAt: string | null;
}

const live = (o: { expiresAt: string | null }, now: number) =>
	!o.expiresAt || Date.parse(o.expiresAt) > now;

/** The tier whose limits apply: the override if there is one, else the tenant's own. An unknown
 * tier resolves as the lowest enabled one, so a deleted tier never leaves a tenant with nothing. */
export function effectiveTier(
	tiers: Tier[],
	tierId: string | null,
	overrideId: string | null
): Tier | null {
	const byId = new Map(tiers.map((t) => [t.id, t]));
	const lowest = [...tiers]
		.filter((t) => t.enabled || true)
		.sort((a, b) => a.position - b.position);
	const enabled = lowest.filter((t) => t.enabled);
	return (
		(overrideId && byId.get(overrideId)) ||
		(tierId && byId.get(tierId)) ||
		enabled[0] ||
		lowest[0] ||
		null
	);
}

/** A quota's limit: a live tenant override, else the tier or the nearest tier below it with a row
 * (an explicit unlimited beats an inherited number), else the declared default, else unlimited.
 * `null` is unlimited. */
export function resolveQuota(
	quota: Quota,
	tiers: Tier[],
	tier: Tier | null,
	tierQuotas: TierQuotas,
	override: QuotaOverride | null,
	declaredDefault: number | null = null,
	now = Date.now()
): number | null {
	if (override && live(override, now)) return override.value;
	if (tier) {
		const below = tiers
			.filter((t) => t.position <= tier.position)
			.sort((a, b) => b.position - a.position);
		for (const t of below) {
			const rows = tierQuotas.get(t.id);
			if (rows?.has(quota)) return rows.get(quota)!;
		}
	}
	return declaredDefault;
}

/** A flag: on by a live tenant override in either direction, else off if disabled, else on at or
 * above its minimum tier. Anything unresolvable is off. */
export function resolveFlag(
	def: FlagDef | undefined,
	tiers: Tier[],
	tier: Tier | null,
	override: FlagOverride | null,
	now = Date.now()
): boolean {
	if (override && live(override, now)) return override.on;
	if (!def || !def.enabled) return false;
	if (def.minTierId === null) return true;
	const min = tiers.find((t) => t.id === def.minTierId);
	if (!min || !tier) return false;
	return tier.position >= min.position;
}

export type UsageLevel = 'ok' | 'warn' | 'over';

/** The 80% warning (§10): a banner, never a block by itself. */
export function usageLevel(used: number, limit: number | null): UsageLevel {
	if (limit === null) return 'ok';
	if (used >= limit) return 'over';
	return used >= limit * 0.8 ? 'warn' : 'ok';
}

/** Whether one more fits under the limit. */
export const hasRoom = (used: number, limit: number | null): boolean =>
	limit === null || used < limit;

/** Which projects stay synced when a tenant has more than its plan allows: the ones it pinned, then
 * the oldest. Returns the ids over the limit (§7.2). Nothing is removed; only syncing stops. */
export function projectsOverLimit(
	projects: { id: string; pinned: boolean }[],
	limit: number | null
): string[] {
	if (limit === null) return [];
	const order = [...projects].sort(
		(a, b) => Number(b.pinned) - Number(a.pinned) || Number(a.id) - Number(b.id)
	);
	return order.slice(limit).map((p) => p.id);
}

// --- Billing's entitlement rule (§7.3) ---

export type SubscriptionStatus = 'incomplete' | 'active' | 'past_due' | 'cancelled';

export interface Subscription {
	status: SubscriptionStatus;
	currentPeriodEnd: string | null;
	tierId: string;
}

/** Days a subscription that failed to renew keeps its tier before the tenant drops to the default. */
export const GRACE_DAYS = 7;

/** Whether a subscription still gives its tier: active; past due within seven days of its period's
 * end; or cancelled with the paid period still running. */
export function entitled(s: Subscription, now = Date.now()): boolean {
	const end = s.currentPeriodEnd ? Date.parse(s.currentPeriodEnd) : null;
	switch (s.status) {
		case 'active':
			return true;
		case 'past_due':
			return end !== null && now <= end + GRACE_DAYS * 86_400_000;
		case 'cancelled':
			return end !== null && now < end;
		default:
			return false;
	}
}

/** The tier a tenant should be on: the best entitled subscription's, else the default. */
export function tierFromSubscriptions(
	subs: Subscription[],
	tiers: Tier[],
	defaultTierId: string,
	now = Date.now()
): string {
	const position = new Map(tiers.map((t) => [t.id, t.position]));
	const best = subs
		.filter((s) => entitled(s, now) && position.has(s.tierId))
		.sort((a, b) => position.get(b.tierId)! - position.get(a.tierId)!)[0];
	return best ? best.tierId : defaultTierId;
}

/** "£12.00" from minor units. */
export function formatMoney(minor: number, currency: string): string {
	return new Intl.NumberFormat('en-GB', { style: 'currency', currency }).format(minor / 100);
}

/** Whether the stub provider may run here: asked for, and not on a production deploy unless that
 * is explicitly allowed (§7.3), so nobody on the hosted service believes they have paid. */
export function stubAvailable(env: {
	provider?: string;
	stub?: string;
	vercelEnv?: string;
}): boolean {
	return env.provider === 'stub' && (env.vercelEnv !== 'production' || !!env.stub);
}
