import { describe, expect, it } from 'vitest';
import {
	alertChanges,
	alertMessage,
	attention,
	errorText,
	fingerprint,
	migrationDrift,
	normaliseMessage,
	parseRateLimit,
	retryDelay,
	summaryMessage,
	syncFailure,
	syncRemedy,
	tenantProblems,
	type OpsSnapshot
} from './ops.ts';

const NOW = Date.parse('2026-10-24T12:00:00Z');
const iso = (msAgo: number) => new Date(NOW - msAgo).toISOString();
const MIN = 60_000;
const HOUR = 60 * MIN;

const empty = (over: Partial<OpsSnapshot> = {}): OpsSnapshot => ({
	now: NOW,
	cron: { startedAt: iso(2 * HOUR), endedAt: iso(2 * HOUR - 30_000), ok: true, steps: [] },
	migrations: { missing: [], unknown: [] },
	projects: [],
	installations: [],
	heldEdits: [],
	digests: [],
	budgets: [],
	errors: [],
	jobs: [],
	webhooks: { badSignatures: 0, failed: 0 },
	...over
});
const project = (over: Partial<OpsSnapshot['projects'][number]> = {}) => ({
	id: '7',
	tenant: 'acme',
	owner: 'acme',
	repo: 'web',
	lastError: null,
	failingSince: null,
	failCount: 0,
	syncStartedAt: null,
	missedWebhooks: 0,
	deferredRuns: 0,
	...over
});

describe('fingerprint', () => {
	it('groups messages that differ only in ids, numbers and quoted values', () => {
		const a = fingerprint(
			'server',
			'/p/[repo]',
			'GitHub 502 GET /repos/x/y/pulls/12: "bad gateway"'
		);
		const b = fingerprint('server', '/p/[repo]', 'GitHub 503 GET /repos/x/y/pulls/97: "upstream"');
		expect(a).toBe(b);
		expect(a).toMatch(/^server:[0-9a-f]{8}$/);
	});

	it('keeps different routes and sources apart', () => {
		const m = 'Cannot read properties of undefined';
		expect(fingerprint('server', '/a', m)).not.toBe(fingerprint('server', '/b', m));
		expect(fingerprint('server', '/a', m)).not.toBe(fingerprint('client', '/a', m));
	});

	it('normalises shas and uuids', () => {
		expect(normaliseMessage('at 3f2a9c1d0b7e1234 and 123e4567-e89b-12d3-a456-426614174000')).toBe(
			'at <sha> and <id>'
		);
	});
});

describe('errorText', () => {
	it('takes the message, and shortens long ones', () => {
		expect(errorText(new Error('boom'))).toBe('boom');
		expect(errorText('x'.repeat(50), 10)).toBe('xxxxxxxxx…');
		expect(errorText({ toString: () => 'odd' })).toBe('odd');
	});
});

describe('parseRateLimit', () => {
	const h = (o: Record<string, string>) => (n: string) => o[n] ?? null;
	it('reads GitHub’s headers', () => {
		expect(
			parseRateLimit(
				h({
					'x-ratelimit-limit': '5000',
					'x-ratelimit-remaining': '4200',
					'x-ratelimit-reset': '1792828800',
					'x-ratelimit-resource': 'graphql'
				})
			)
		).toEqual({
			resource: 'graphql',
			remaining: 4200,
			limit: 5000,
			resetAt: new Date(1792828800 * 1000).toISOString()
		});
	});
	it('is null when they are absent', () => expect(parseRateLimit(h({}))).toBeNull());
});

describe('retryDelay', () => {
	it('retries 5xx and network failures twice, backing off', () => {
		expect(retryDelay({ status: 502, attempt: 0, idempotent: true })).toBe(500);
		expect(retryDelay({ status: 0, attempt: 1, idempotent: true })).toBe(1500);
		expect(retryDelay({ status: 502, attempt: 2, idempotent: true })).toBeNull();
	});
	it('never retries a write', () =>
		expect(retryDelay({ status: 502, attempt: 0, idempotent: false })).toBeNull());
	it('honours a short retry-after on a secondary limit, not the primary one', () => {
		expect(retryDelay({ status: 403, attempt: 0, idempotent: true, retryAfter: '3' })).toBe(3000);
		expect(retryDelay({ status: 403, attempt: 0, idempotent: true, retryAfter: '60' })).toBeNull();
		expect(retryDelay({ status: 403, attempt: 0, idempotent: true, remaining: '0' })).toBeNull();
		expect(retryDelay({ status: 403, attempt: 0, idempotent: true })).toBeNull();
		expect(retryDelay({ status: 404, attempt: 0, idempotent: true })).toBeNull();
	});
});

describe('migrationDrift', () => {
	it('lists what the database lacks and what it has that the code doesn’t', () => {
		expect(
			migrationDrift(['001.sql', '002.sql', '099.sql'], ['001.sql', '002.sql', '003.sql'])
		).toEqual({ missing: ['003.sql'], unknown: ['099.sql'] });
	});
});

describe('attention', () => {
	it('is empty when all is well', () => expect(attention(empty())).toEqual([]));

	it('flags a cron that has stopped, and one that never ran', () => {
		const late = attention(
			empty({ cron: { startedAt: iso(27 * HOUR), endedAt: null, ok: true, steps: [] } })
		);
		expect(late.map((a) => [a.key, a.severity, a.alert])).toEqual([
			['cron:late', 'critical', true]
		]);
		expect(attention(empty({ cron: null }))[0]).toMatchObject({ key: 'cron:never', alert: true });
	});

	it('flags failed cron steps, with a fix to run it again', () => {
		const [a] = attention(
			empty({
				cron: {
					startedAt: iso(HOUR),
					endedAt: iso(HOUR),
					ok: false,
					steps: [
						{ step: 'sync', ok: true, ms: 10 },
						{ step: 'billing', ok: false, ms: 5, error: 'provider 500' }
					]
				}
			})
		);
		expect(a).toMatchObject({ key: 'cron:steps:billing', detail: 'billing: provider 500' });
		expect(a.fixes).toEqual([{ action: 'cron', label: 'Run the cron again', params: {} }]);
	});

	it('alerts on a failing sync only after an hour', () => {
		const brief = attention(
			empty({ projects: [project({ failCount: 2, failingSince: iso(10 * MIN), lastError: 'x' })] })
		);
		expect(brief[0]).toMatchObject({ key: 'sync:7', severity: 'warning', alert: false });
		const long = attention(
			empty({ projects: [project({ failCount: 9, failingSince: iso(2 * HOUR), lastError: 'x' })] })
		);
		expect(long[0]).toMatchObject({ severity: 'critical', alert: true });
		expect(long[0].fixes[0]).toEqual({
			action: 'sync',
			label: 'Sync now',
			params: { project: '7' }
		});
	});

	it('flags a stuck sync with a fix that clears it', () => {
		const [a] = attention(empty({ projects: [project({ syncStartedAt: iso(12 * MIN) })] }));
		expect(a).toMatchObject({ key: 'stuck:7', alert: false });
		expect(a.fixes[0].action).toBe('unstick');
		expect(attention(empty({ projects: [project({ syncStartedAt: iso(2 * MIN) })] }))).toEqual([]);
	});

	it('flags missed webhooks, migrations, token errors and low budgets', () => {
		const keys = attention(
			empty({
				projects: [project({ missedWebhooks: 2 })],
				migrations: { missing: ['016_observability.sql'], unknown: [] },
				installations: [
					{
						id: '9',
						tenant: 'acme',
						account: 'acme',
						suspendedAt: null,
						tokenError: '401',
						createdAt: iso(0)
					}
				],
				budgets: [
					{
						scope: 'installation:9',
						resource: 'graphql',
						remaining: 300,
						limit: 5000,
						resetAt: iso(-HOUR)
					},
					{
						scope: 'installation:8',
						resource: 'core',
						remaining: 4000,
						limit: 5000,
						resetAt: iso(-HOUR)
					},
					{
						scope: 'installation:7',
						resource: 'core',
						remaining: 1,
						limit: 5000,
						resetAt: iso(HOUR)
					}
				]
			})
		).map((a) => a.key);
		expect(keys).toEqual(['migrations', 'token:9', 'budget:installation:9:graphql', 'missed:7']);
	});

	it('alerts on a new error but not on an old one still happening', () => {
		const e = {
			fingerprint: 'server:1',
			source: 'server',
			route: '/x',
			message: 'boom',
			lastSeen: iso(0),
			recent: 3
		};
		expect(attention(empty({ errors: [{ ...e, firstSeen: iso(HOUR) }] }))[0]).toMatchObject({
			title: 'New error on /x: 3 in the last day',
			alert: true
		});
		expect(attention(empty({ errors: [{ ...e, firstSeen: iso(48 * HOUR) }] }))[0].alert).toBe(
			false
		);
		expect(attention(empty({ errors: [{ ...e, firstSeen: iso(HOUR), recent: 0 }] }))).toEqual([]);
	});

	it('releases edits stuck while saving, and names who must sign in again', () => {
		const base = { projectId: '7', tenant: 'acme', owner: 'acme', repo: 'web', count: 2 };
		const out = attention(
			empty({
				heldEdits: [
					{ ...base, oldest: iso(20 * MIN), reason: 'claimed' },
					{ ...base, oldest: iso(20 * MIN), reason: 'reauth', login: 'sam' }
				]
			})
		);
		expect(out.map((a) => a.key)).toEqual(['claimed:7', 'reauth:7:sam']);
		expect(out[1].remedy).toContain('sam');
	});

	it('lists a project on a refused installation once, under the installation', () => {
		const out = attention(
			empty({
				installations: [
					{
						id: '9',
						tenant: 'acme',
						account: 'acme',
						suspendedAt: null,
						tokenError: '401',
						createdAt: iso(0)
					}
				],
				projects: [
					project({
						installationId: '9',
						failCount: 3,
						failingSince: iso(2 * HOUR),
						lastError: '401'
					})
				]
			})
		);
		expect(out.map((a) => a.key)).toEqual(['token:9']);
	});

	it('doesn’t list a failing digest twice', () => {
		const out = attention(
			empty({
				digests: [{ tenantId: '1', tenant: 'acme', error: 'Slack said 404', failedAt: iso(HOUR) }],
				jobs: [{ kind: 'digest', failed: 1, lastError: 'Slack said 404' }]
			})
		);
		expect(out.map((a) => a.key)).toEqual(['digest:1']);
	});

	it('offers to dismiss failed background work', () => {
		const [a] = attention(
			empty({ jobs: [{ kind: 'github access', failed: 1, lastError: 'GitHub 401' }] })
		);
		expect(a.fixes).toEqual([
			{ action: 'dismiss', label: 'Dismiss', params: { kind: 'github access' } }
		]);
	});

	it('puts critical things first', () => {
		const out = attention(
			empty({
				projects: [project({ missedWebhooks: 1 })],
				webhooks: { badSignatures: 5, failed: 0 }
			})
		);
		expect(out.map((a) => a.severity)).toEqual(['critical', 'warning']);
	});
});

describe('alerts', () => {
	const a = attention(
		empty({ projects: [project({ failCount: 3, failingSince: iso(3 * HOUR), lastError: 'boom' })] })
	);

	it('opens what is new and closes what has cleared, once', () => {
		expect(alertChanges([], a)).toEqual({ opened: a, closed: [] });
		expect(alertChanges(['sync:7'], a)).toEqual({ opened: [], closed: [] });
		expect(alertChanges(['sync:7', 'cron:late'], a)).toEqual({ opened: [], closed: ['cron:late'] });
	});

	it('writes one Slack message, with links', () => {
		const m = alertMessage(
			a,
			[{ key: 'cron:late', title: 'The daily cron has stopped' }],
			'https://pm.test'
		);
		expect(m!.text).toContain('*acme/web (acme) fails to sync*');
		expect(m!.text).toContain('<https://pm.test/admin/ops/project/7|Open in Project Magic>');
		expect(m!.text).toContain('Cleared: The daily cron has stopped');
		expect(alertMessage([], [], 'x')).toBeNull();
	});

	it('says all is well when it is', () => {
		expect(summaryMessage([], 'https://pm.test').text).toContain('all is well');
		expect(summaryMessage(a, 'https://pm.test').text).toContain(
			'1 thing needs attention, 1 critical'
		);
	});
});

describe('tenantProblems', () => {
	it('lists what a tenant can put right, once each', () => {
		const out = tenantProblems(
			{
				...empty(),
				installations: [
					{
						id: '9',
						tenant: 'acme',
						account: 'acme',
						suspendedAt: null,
						tokenError: '401',
						createdAt: iso(0)
					}
				],
				projects: [
					project({ installationId: '9', failCount: 3, lastError: '401' }),
					project({
						id: '8',
						repo: 'api',
						installationId: '7',
						failCount: 1,
						lastError: 'GitHub 502'
					})
				],
				heldEdits: [
					{
						projectId: '7',
						tenant: 'acme',
						owner: 'acme',
						repo: 'web',
						count: 1,
						oldest: iso(HOUR),
						reason: 'reauth',
						login: 'sam'
					}
				]
			},
			{ paused: 2, repoParam: (_o, r) => r }
		);
		expect(out.map((p) => p.key)).toEqual(['token:9', 'sync:8', 'reauth:7:sam', 'paused']);
		expect(out[1]).toMatchObject({ href: '/p/api', remedy: expect.stringContaining('Refresh') });
	});
});

describe('syncFailure', () => {
	it('says how long it has been failing', () => {
		expect(syncFailure({ lastError: null, failingSince: null, failCount: 0 }, NOW)).toBeNull();
		expect(syncFailure({ lastError: 'x', failingSince: iso(MIN), failCount: 1 }, NOW)).toBe(
			'Last sync failed: x'
		);
		expect(
			syncFailure({ lastError: 'x', failingSince: iso(3 * 24 * HOUR), failCount: 6 }, NOW)
		).toBe('Sync has failed 6 times in a row, for 3 days: x');
	});
});

describe('syncRemedy', () => {
	it('reads the usual causes', () => {
		expect(syncRemedy('GraphQL: API rate limit exceeded')).toMatch(/rate limit/);
		expect(syncRemedy('GitHub 401 /x: Bad credentials')).toMatch(/refused the App/);
		expect(syncRemedy('GraphQL: Could not resolve to a Repository')).toMatch(/can’t find/);
		expect(syncRemedy('GitHub timed out after 30s')).toMatch(/slow or down/);
	});
});
