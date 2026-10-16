import { describe, expect, it } from 'vitest';
import {
	effectiveTier,
	entitled,
	hasRoom,
	projectsOverLimit,
	resolveFlag,
	resolveQuota,
	tierFromSubscriptions,
	usageLevel,
	type Tier,
	type TierQuotas
} from './plans.ts';

const tiers: Tier[] = [
	{ id: 'free', position: 1, enabled: true },
	{ id: 'team', position: 2, enabled: true },
	{ id: 'biz', position: 3, enabled: true },
	{ id: 'old', position: 4, enabled: false }
];
const rows: TierQuotas = new Map([
	[
		'free',
		new Map<string, number | null>([
			['members', 5],
			['projects', 3]
		])
	],
	['team', new Map<string, number | null>([['members', 25]])],
	['biz', new Map<string, number | null>([['members', null]])]
]);
const q = (
	quota: 'members' | 'projects' | 'ai_tokens_daily',
	tier: string,
	o = null as never,
	def: number | null = null
) => resolveQuota(quota, tiers, tiers.find((t) => t.id === tier) ?? null, rows, o, def);

describe('effectiveTier', () => {
	it('prefers the override, then the tenant’s tier', () => {
		expect(effectiveTier(tiers, 'team', 'biz')?.id).toBe('biz');
		expect(effectiveTier(tiers, 'team', null)?.id).toBe('team');
	});
	it('resolves an unknown tier as the lowest enabled one', () => {
		expect(effectiveTier(tiers, 'gone', null)?.id).toBe('free');
		expect(effectiveTier(tiers, null, 'gone')?.id).toBe('free');
		expect(effectiveTier([], 'x', null)).toBeNull();
	});
});

describe('resolveQuota', () => {
	it('uses the tier’s own row', () => {
		expect(q('members', 'free')).toBe(5);
		expect(q('members', 'team')).toBe(25);
	});
	it('inherits from the nearest lower tier with a row', () => {
		expect(q('projects', 'team')).toBe(3);
		expect(q('projects', 'biz')).toBe(3);
	});
	it('lets an explicit unlimited beat an inherited number', () => {
		expect(q('members', 'biz')).toBeNull();
	});
	it('falls back to the declared default, then unlimited', () => {
		expect(q('ai_tokens_daily', 'team', null as never, 50_000)).toBe(50_000);
		expect(q('ai_tokens_daily', 'team')).toBeNull();
	});
	it('does not inherit from a higher tier', () => {
		expect(
			resolveQuota('members', tiers, tiers[0], new Map([['team', new Map([['members', 9]])]]), null)
		).toBeNull();
	});
	it('lets a live override beat everything, in either direction, and ignores an expired one', () => {
		const now = Date.parse('2026-10-16T12:00:00Z');
		const at = (o: { value: number | null; expiresAt: string | null } | null) =>
			resolveQuota('members', tiers, tiers[0], rows, o, null, now);
		expect(at({ value: 100, expiresAt: null })).toBe(100);
		expect(at({ value: 2, expiresAt: '2026-11-01T00:00:00Z' })).toBe(2);
		expect(at({ value: null, expiresAt: null })).toBeNull();
		expect(at({ value: 100, expiresAt: '2026-10-01T00:00:00Z' })).toBe(5);
	});
});

describe('resolveFlag', () => {
	const flag = (minTierId: string | null, enabled = true) => ({ enabled, minTierId });
	const on = (def: ReturnType<typeof flag> | undefined, tier: string, o = null as never) =>
		resolveFlag(def, tiers, tiers.find((t) => t.id === tier) ?? null, o);
	it('is on at or above its minimum tier, and for every tier when it has none', () => {
		expect(on(flag('team'), 'free')).toBe(false);
		expect(on(flag('team'), 'team')).toBe(true);
		expect(on(flag('team'), 'biz')).toBe(true);
		expect(on(flag(null), 'free')).toBe(true);
	});
	it('is off when disabled, unknown, or unresolvable', () => {
		expect(on(flag(null, false), 'biz')).toBe(false);
		expect(on(undefined, 'biz')).toBe(false);
		expect(on(flag('gone'), 'biz')).toBe(false);
		expect(on(flag('team'), 'nope')).toBe(false);
	});
	it('is decided by a live override in either direction', () => {
		expect(on(flag('biz'), 'free', { on: true, expiresAt: null } as never)).toBe(true);
		expect(on(flag(null), 'biz', { on: false, expiresAt: null } as never)).toBe(false);
		expect(on(flag(null), 'biz', { on: false, expiresAt: '2020-01-01T00:00:00Z' } as never)).toBe(
			true
		);
	});
});

describe('usage', () => {
	it('warns at 80% and is over at the limit', () => {
		expect(usageLevel(7, 10)).toBe('ok');
		expect(usageLevel(8, 10)).toBe('warn');
		expect(usageLevel(10, 10)).toBe('over');
		expect(usageLevel(1e9, null)).toBe('ok');
	});
	it('has room below the limit only', () => {
		expect(hasRoom(9, 10)).toBe(true);
		expect(hasRoom(10, 10)).toBe(false);
		expect(hasRoom(1e9, null)).toBe(true);
	});
});

describe('projectsOverLimit', () => {
	const ps = [
		{ id: '4', pinned: false },
		{ id: '1', pinned: false },
		{ id: '3', pinned: true },
		{ id: '2', pinned: false }
	];
	it('keeps the pinned ones, then the oldest', () => {
		expect(projectsOverLimit(ps, 2)).toEqual(['2', '4']);
		expect(projectsOverLimit(ps, 3)).toEqual(['4']);
	});
	it('takes nothing away when unlimited or under the limit', () => {
		expect(projectsOverLimit(ps, null)).toEqual([]);
		expect(projectsOverLimit(ps, 10)).toEqual([]);
	});
	it('compares ids as numbers', () => {
		expect(
			projectsOverLimit(
				[
					{ id: '10', pinned: false },
					{ id: '9', pinned: false }
				],
				1
			)
		).toEqual(['10']);
	});
});

describe('entitlement', () => {
	const now = Date.parse('2026-10-16T12:00:00Z');
	const day = 86_400_000;
	const sub = (
		status: 'incomplete' | 'active' | 'past_due' | 'cancelled',
		endOffsetDays: number | null,
		tierId = 'team'
	) => ({
		status,
		tierId,
		currentPeriodEnd:
			endOffsetDays === null ? null : new Date(now + endOffsetDays * day).toISOString()
	});
	it('is entitled while active', () => expect(entitled(sub('active', 10), now)).toBe(true));
	it('is entitled when past due, for seven days after the period’s end', () => {
		expect(entitled(sub('past_due', -3), now)).toBe(true);
		expect(entitled(sub('past_due', -8), now)).toBe(false);
		expect(entitled(sub('past_due', null), now)).toBe(false);
	});
	it('is entitled when cancelled while the paid period still runs', () => {
		expect(entitled(sub('cancelled', 5), now)).toBe(true);
		expect(entitled(sub('cancelled', -1), now)).toBe(false);
	});
	it('is not entitled before it is paid for', () =>
		expect(entitled(sub('incomplete', 30), now)).toBe(false));

	it('puts a tenant on the best entitled subscription’s tier, else the default', () => {
		const subs = [sub('active', 10, 'team'), sub('active', 10, 'biz'), sub('cancelled', -2, 'biz')];
		expect(tierFromSubscriptions(subs, tiers, 'free', now)).toBe('biz');
		expect(tierFromSubscriptions([sub('cancelled', -2, 'biz')], tiers, 'free', now)).toBe('free');
		expect(tierFromSubscriptions([], tiers, 'free', now)).toBe('free');
		expect(tierFromSubscriptions([sub('active', 10, 'deleted')], tiers, 'free', now)).toBe('free');
	});
});
