// What the Operations tab, the tenant page, the alerts and /api/health read (PM51, PM55, PM56):
// metadata about Project Magic's own health, never a tenant's content. Each query tolerates a
// database before migration 016 (columns read through to_jsonb, tables caught), so the tab works,
// and says the migration is missing, rather than failing.
import {
	BILLING_PROVIDER,
	CRON_SECRET,
	GITHUB_APP_ID,
	GITHUB_APP_PRIVATE_KEY,
	GITHUB_APP_PRIVATE_KEY_PATH,
	GITHUB_WEBHOOK_SECRET,
	INFERENCE_PROVIDER
} from '$app/env/private';
import { migrationDrift, type CronStep, type OpsSnapshot } from '#lib/core/ops.ts';
import { db } from './db.ts';
import { builtAt, missingSchema, version } from './ops.ts';

/** The migrations this build ships, by name. Vite lists them at build time; the files themselves
 * aren't deployed. */
const SHIPPED = Object.keys(import.meta.glob('/migrations/*.sql', { query: '?raw' }))
	.map((p) => p.split('/').pop()!)
	.sort();
export const shippedMigrations = (): string[] => SHIPPED;

/** Runs a query, and gives `fallback` when a later migration's table or column isn't there. */
async function tolerant<T>(q: () => Promise<T>, fallback: T): Promise<T> {
	try {
		return await q();
	} catch (e) {
		if (missingSchema(e)) return fallback;
		throw e;
	}
}

/** A list query's rows as a plain array; none when a later migration's table isn't there. */
async function rows<T>(q: () => PromiseLike<Iterable<T>>): Promise<T[]> {
	try {
		return [...(await q())];
	} catch (e) {
		if (missingSchema(e)) return [];
		throw e;
	}
}

const isoOf = (d: Date | string | null | undefined) =>
	d ? (d instanceof Date ? d.toISOString() : new Date(d).toISOString()) : null;

export async function migrations(): Promise<{ missing: string[]; unknown: string[] } | null> {
	const applied = await tolerant(
		async () =>
			(await db()<{ name: string }[]>`select name from schema_migration`).map((r) => r.name),
		null
	);
	return applied ? migrationDrift(applied, SHIPPED) : null;
}

export interface CronRun {
	id: string;
	startedAt: string;
	endedAt: string | null;
	ok: boolean | null;
	steps: CronStep[];
	version: string | null;
}

export async function cronRuns(limit = 10): Promise<CronRun[]> {
	return tolerant(
		async () =>
			(
				await db()<
					{
						id: string;
						started_at: Date;
						ended_at: Date | null;
						ok: boolean | null;
						steps_json: CronStep[];
						version: string | null;
					}[]
				>`select id, started_at, ended_at, ok, steps_json, version from cron_run order by started_at desc limit ${limit}`
			).map((r) => ({
				id: String(r.id),
				startedAt: r.started_at.toISOString(),
				endedAt: isoOf(r.ended_at),
				ok: r.ok,
				steps: r.steps_json ?? [],
				version: r.version
			})),
		[]
	);
}

/** How many of the latest cron runs in a row left each project for later. */
function deferredRuns(runs: CronRun[]): Map<string, number> {
	const out = new Map<string, number>();
	const lists = runs
		.slice(0, 5)
		.map(
			(r) => new Set((r.steps.find((s) => s.step === 'sync')?.detail?.deferred as string[]) ?? [])
		);
	for (const id of new Set(lists.flatMap((l) => [...l]))) {
		let n = 0;
		while (n < lists.length && lists[n].has(id)) n++;
		if (n) out.set(id, n);
	}
	return out;
}

/** Everything the attention rules read, for every tenant or for one. */
export async function snapshot(tenantId: string | null = null): Promise<OpsSnapshot> {
	const sql = db();
	const t = tenantId;
	const runs = await cronRuns(5);
	const deferred = deferredRuns(runs);

	const projects = await sql<
		{
			id: string;
			tenant: string;
			owner: string;
			repo: string;
			last_error: string | null;
			failing_since: string | null;
			fail_count: string | null;
			sync_started_at: Date | null;
			installation_id: string;
		}[]
	>`select p.id, p.installation_id, tn.slug as tenant, p.owner, p.repo, p.last_error, to_jsonb(p)->>'failing_since' as failing_since,
		to_jsonb(p)->>'fail_count' as fail_count, p.sync_started_at
		from project p join tenant tn on tn.id = p.tenant_id
		where (to_jsonb(p)->>'uninstalled_at') is null and tn.status = 'active'
		and (${t}::bigint is null or p.tenant_id = ${t}::bigint)`;
	const missed = new Map(
		(
			await rows(
				() => sql<{ project_id: string; n: number }[]>`
					select project_id, count(*)::int as n from job_run
					where kind = 'sync' and detail_json->>'missedWebhook' = 'true' and started_at > now() - interval '7 days'
					group by project_id`
			)
		).map((r) => [String(r.project_id), r.n])
	);

	const installations = await sql<
		{
			id: string;
			tenant: string | null;
			account: string;
			suspended_at: Date | null;
			token_error: string | null;
			created_at: Date;
		}[]
	>`select i.id, tn.slug as tenant, i.account_login as account, i.suspended_at,
		to_jsonb(i)->>'token_error' as token_error, i.created_at
		from installation i left join tenant tn on tn.id = i.tenant_id
		where i.removed_at is null and (${t}::bigint is null or i.tenant_id = ${t}::bigint)`;

	const claimed = await rows(
		() => sql<
			{ project_id: string; tenant: string; owner: string; repo: string; n: number; oldest: Date }[]
		>`
			select e.project_id, tn.slug as tenant, p.owner, p.repo, count(*)::int as n, min(e.claimed_at) as oldest
			from pending_edit e join project p on p.id = e.project_id join tenant tn on tn.id = p.tenant_id
			where e.claimed_at is not null and e.conflict is null
			and (${t}::bigint is null or p.tenant_id = ${t}::bigint)
			group by e.project_id, tn.slug, p.owner, p.repo`
	);
	const reauth = await rows(
		() => sql<
			{
				project_id: string;
				tenant: string;
				owner: string;
				repo: string;
				login: string;
				n: number;
				oldest: Date;
			}[]
		>`
			select e.project_id, tn.slug as tenant, p.owner, p.repo, u.github_login as login, count(*)::int as n,
				min(e.created_at) as oldest
			from pending_edit e join project p on p.id = e.project_id join tenant tn on tn.id = p.tenant_id
			join app_user u on u.id = e.user_id
			where e.conflict is null and e.created_at < now() - interval '10 minutes'
			and (u.refresh_token_enc is null or u.refresh_token_expires_at < now()
				or (to_jsonb(u)->>'refresh_error') is not null)
			and (${t}::bigint is null or p.tenant_id = ${t}::bigint)
			group by e.project_id, tn.slug, p.owner, p.repo, u.github_login`
	);

	const digests = await rows(
		() => sql<{ tenant_id: string; tenant: string; error: string; failed_at: Date }[]>`
			select s.tenant_id, tn.slug as tenant, s.digest_last_error as error, s.digest_failed_at as failed_at
			from tenant_setting s join tenant tn on tn.id = s.tenant_id
			where s.digest_last_error is not null and s.digest_failed_at > now() - interval '3 days'
			and s.slack_webhook_enc is not null and tn.status = 'active'
			and (${t}::bigint is null or s.tenant_id = ${t}::bigint)`
	);

	const budgets = t
		? []
		: await rows(
				() => sql<
					{ scope: string; resource: string; remaining: number; limit: number; reset_at: Date }[]
				>`
					select scope, resource, remaining, "limit", reset_at from github_budget order by scope, resource`
			);

	const errors = await rows(
		() => sql<
			{
				fingerprint: string;
				source: string;
				route: string | null;
				message: string;
				first_seen: Date;
				last_seen: Date;
				recent: number;
			}[]
		>`
			select g.fingerprint, g.source, g.route, g.message, g.first_seen, g.last_seen,
				(select count(*)::int from app_error e where e.fingerprint = g.fingerprint and e.at > now() - interval '1 day'
					and (${t}::bigint is null or e.tenant_id = ${t}::bigint)) as recent
			from error_group g where g.resolved_at is null and g.last_seen > now() - interval '1 day'
			order by g.last_seen desc limit 50`
	);

	const jobs = await rows(
		() => sql<{ kind: string; failed: number; last_error: string | null }[]>`
			select kind, count(*)::int as failed,
				(array_agg(error order by started_at desc))[1] as last_error
			from job_run where outcome in ('failed', 'stuck') and started_at > now() - interval '1 day'
			and detail_json->>'dismissedAt' is null
			and kind not in ('sync', 'webhook', 'webhook signature')
			and (${t}::bigint is null or tenant_id = ${t}::bigint
				or project_id in (select id from project where tenant_id = ${t}::bigint))
			group by kind order by kind`
	);

	const [hooks] = t
		? [{ bad: 0, failed: 0 }]
		: await rows(
				() => sql<{ bad: number; failed: number }[]>`
					select count(*) filter (where kind = 'webhook signature')::int as bad,
						count(*) filter (where kind = 'webhook')::int as failed
					from job_run where kind in ('webhook', 'webhook signature') and outcome = 'failed'
					and started_at > now() - interval '1 day'`
			);

	return {
		now: Date.now(),
		cron: runs[0]
			? {
					startedAt: runs[0].startedAt,
					endedAt: runs[0].endedAt,
					ok: runs[0].ok,
					steps: runs[0].steps
				}
			: null,
		migrations: t ? null : await migrations(),
		projects: projects
			.map((p) => ({
				id: String(p.id),
				installationId: String(p.installation_id),
				tenant: p.tenant,
				owner: p.owner,
				repo: p.repo,
				lastError: p.last_error,
				failingSince: p.failing_since ? new Date(p.failing_since).toISOString() : null,
				// Before migration 016 there is no count: a last error is one failure.
				failCount: p.fail_count === null ? (p.last_error ? 1 : 0) : Number(p.fail_count),
				syncStartedAt: isoOf(p.sync_started_at),
				missedWebhooks: missed.get(String(p.id)) ?? 0,
				deferredRuns: deferred.get(String(p.id)) ?? 0
			}))
			.filter(
				(p) => p.failCount || p.lastError || p.syncStartedAt || p.missedWebhooks || p.deferredRuns
			),
		installations: installations
			.filter((i) => i.suspended_at || i.token_error || !i.tenant)
			.map((i) => ({
				id: String(i.id),
				tenant: i.tenant,
				account: i.account,
				suspendedAt: isoOf(i.suspended_at),
				tokenError: i.token_error,
				createdAt: i.created_at.toISOString()
			})),
		heldEdits: [
			...claimed.map((c) => ({
				projectId: String(c.project_id),
				tenant: c.tenant,
				owner: c.owner,
				repo: c.repo,
				count: c.n,
				oldest: c.oldest.toISOString(),
				reason: 'claimed' as const
			})),
			...reauth.map((c) => ({
				projectId: String(c.project_id),
				tenant: c.tenant,
				owner: c.owner,
				repo: c.repo,
				count: c.n,
				oldest: c.oldest.toISOString(),
				reason: 'reauth' as const,
				login: c.login
			}))
		],
		digests: digests.map((d) => ({
			tenantId: String(d.tenant_id),
			tenant: d.tenant,
			error: d.error,
			failedAt: d.failed_at.toISOString()
		})),
		budgets: budgets.map((b) => ({
			scope: b.scope,
			resource: b.resource,
			remaining: b.remaining,
			limit: b.limit,
			resetAt: b.reset_at.toISOString()
		})),
		errors: errors.map((e) => ({
			fingerprint: e.fingerprint,
			source: e.source,
			route: e.route,
			message: e.message,
			firstSeen: e.first_seen.toISOString(),
			lastSeen: e.last_seen.toISOString(),
			recent: e.recent
		})),
		jobs: jobs.map((j) => ({ kind: j.kind, failed: j.failed, lastError: j.last_error })),
		webhooks: { badSignatures: hooks?.bad ?? 0, failed: hooks?.failed ?? 0 }
	};
}

/** The "Now" panel and /api/health: what is running, and whether its dependencies answer. */
export interface Now {
	version: string;
	builtAt: string | null;
	db: { ok: boolean; ms: number | null; error: string | null };
	migrations: { missing: string[]; unknown: string[]; applied: number; shipped: number } | null;
	configured: Record<string, boolean>;
	cron: { lastStartedAt: string | null; ok: boolean | null };
}

export async function now(): Promise<Now> {
	const t0 = performance.now();
	let dbState: Now['db'];
	try {
		await db()`select 1`;
		dbState = { ok: true, ms: Math.round(performance.now() - t0), error: null };
	} catch (e) {
		dbState = { ok: false, ms: null, error: e instanceof Error ? e.message : String(e) };
	}
	const m = dbState.ok ? await migrations().catch(() => null) : null;
	const [cron] = dbState.ok ? await cronRuns(1).catch(() => []) : [];
	return {
		version: version(),
		builtAt: builtAt(),
		db: dbState,
		migrations: m && {
			...m,
			applied: SHIPPED.length - m.missing.length + m.unknown.length,
			shipped: SHIPPED.length
		},
		configured: {
			'GitHub App': !!GITHUB_APP_ID && !!(GITHUB_APP_PRIVATE_KEY || GITHUB_APP_PRIVATE_KEY_PATH),
			'Webhook secret': !!GITHUB_WEBHOOK_SECRET,
			'Cron secret': !!CRON_SECRET,
			Model: !!INFERENCE_PROVIDER,
			Billing: !!BILLING_PROVIDER
		},
		cron: { lastStartedAt: cron?.startedAt ?? null, ok: cron?.ok ?? null }
	};
}

export interface JobRow {
	id: string;
	kind: string;
	trigger: string | null;
	project: string | null;
	projectId: string | null;
	tenant: string | null;
	startedAt: string;
	ms: number | null;
	outcome: string;
	error: string | null;
	detail: Record<string, unknown> | null;
}

/** Background work, newest first, filtered by kind, outcome, project or tenant. */
export async function jobs(f: {
	kind?: string | null;
	outcome?: string | null;
	projectId?: string | null;
	tenantId?: string | null;
	limit?: number;
}): Promise<JobRow[]> {
	return tolerant(
		async () =>
			(
				await db()<
					{
						id: string;
						kind: string;
						trigger: string | null;
						project: string | null;
						project_id: string | null;
						tenant: string | null;
						started_at: Date;
						ms: number | null;
						outcome: string;
						error: string | null;
						detail_json: Record<string, unknown> | null;
					}[]
				>`select j.id, j.kind, j.trigger, p.owner || '/' || p.repo as project, j.project_id,
					coalesce(tn.slug, tp.slug) as tenant, j.started_at,
					(extract(epoch from (j.ended_at - j.started_at)) * 1000)::int as ms, j.outcome, j.error, j.detail_json
				from job_run j left join project p on p.id = j.project_id
				left join tenant tn on tn.id = j.tenant_id left join tenant tp on tp.id = p.tenant_id
				where (${f.kind ?? null}::text is null or j.kind = ${f.kind ?? null})
				and (${f.outcome ?? null}::text is null or j.outcome = ${f.outcome ?? null}
					or (${f.outcome ?? null} = 'problem' and j.outcome not in ('ok', 'running', 'skipped')))
				and (${f.projectId ?? null}::bigint is null or j.project_id = ${f.projectId ?? null}::bigint)
				and (${f.tenantId ?? null}::bigint is null or j.tenant_id = ${f.tenantId ?? null}::bigint
					or p.tenant_id = ${f.tenantId ?? null}::bigint)
				order by j.started_at desc limit ${f.limit ?? 100}`
			).map((r) => ({
				id: String(r.id),
				kind: r.kind,
				trigger: r.trigger,
				project: r.project,
				projectId: r.project_id ? String(r.project_id) : null,
				tenant: r.tenant,
				startedAt: r.started_at.toISOString(),
				ms: r.ms,
				outcome: r.outcome,
				error: r.error,
				detail: r.detail_json
			})),
		[]
	);
}

/** Runs and failures by kind over the last day, and the slowest run of each. */
export async function jobSummary(): Promise<
	{ kind: string; runs: number; failed: number; slowestMs: number | null }[]
> {
	return rows(
		() => db()<{ kind: string; runs: number; failed: number; slowestMs: number | null }[]>`
			select kind, count(*)::int as runs,
				count(*) filter (where outcome not in ('ok', 'running', 'skipped'))::int as failed,
				max((extract(epoch from (ended_at - started_at)) * 1000)::int) as "slowestMs"
			from job_run where started_at > now() - interval '1 day' group by kind order by kind`
	);
}

export interface ErrorGroup {
	fingerprint: string;
	source: string;
	route: string | null;
	message: string;
	firstSeen: string;
	lastSeen: string;
	occurrences: number;
	hour: number;
	day: number;
	week: number;
	resolvedAt: string | null;
}

export async function errorGroups(includeResolved = false): Promise<ErrorGroup[]> {
	return tolerant(
		async () =>
			(
				await db()<
					{
						fingerprint: string;
						source: string;
						route: string | null;
						message: string;
						first_seen: Date;
						last_seen: Date;
						occurrences: number;
						hour: number;
						day: number;
						week: number;
						resolved_at: Date | null;
					}[]
				>`select g.*,
					(select count(*)::int from app_error e where e.fingerprint = g.fingerprint and e.at > now() - interval '1 hour') as hour,
					(select count(*)::int from app_error e where e.fingerprint = g.fingerprint and e.at > now() - interval '1 day') as day,
					(select count(*)::int from app_error e where e.fingerprint = g.fingerprint and e.at > now() - interval '7 days') as week
				from error_group g where ${includeResolved} or g.resolved_at is null
				order by g.last_seen desc limit 200`
			).map((g) => ({
				fingerprint: g.fingerprint,
				source: g.source,
				route: g.route,
				message: g.message,
				firstSeen: g.first_seen.toISOString(),
				lastSeen: g.last_seen.toISOString(),
				occurrences: g.occurrences,
				hour: g.hour,
				day: g.day,
				week: g.week,
				resolvedAt: isoOf(g.resolved_at)
			})),
		[]
	);
}

export interface ErrorOccurrence {
	ref: string;
	at: string;
	method: string | null;
	status: number | null;
	message: string;
	stack: string | null;
	user: string | null;
	tenant: string | null;
	project: string | null;
	version: string | null;
}

export async function errorDetail(
	fp: string
): Promise<{ group: ErrorGroup; occurrences: ErrorOccurrence[] } | null> {
	const group = (await errorGroups(true)).find((g) => g.fingerprint === fp);
	if (!group) return null;
	const found = await rows(
		() => db()<
			{
				ref: string;
				at: Date;
				method: string | null;
				status: number | null;
				message: string;
				stack: string | null;
				login: string | null;
				tenant: string | null;
				project: string | null;
				version: string | null;
			}[]
		>`select e.ref, e.at, e.method, e.status, e.message, e.stack, u.github_login as login, tn.slug as tenant,
				p.owner || '/' || p.repo as project, e.version
			from app_error e left join app_user u on u.id = e.user_id left join tenant tn on tn.id = e.tenant_id
			left join project p on p.id = e.project_id
			where e.fingerprint = ${fp} order by e.at desc limit 50`
	);
	return {
		group,
		occurrences: found.map((r) => ({
			ref: r.ref,
			at: r.at.toISOString(),
			method: r.method,
			status: r.status,
			message: r.message,
			stack: r.stack,
			user: r.login,
			tenant: r.tenant,
			project: r.project,
			version: r.version
		}))
	};
}

/** The group an error reference belongs to, so a reference a person quotes finds it. */
export async function errorByRef(ref: string): Promise<string | null> {
	const [r] = await rows(
		() =>
			db()<
				{ fingerprint: string }[]
			>`select fingerprint from app_error where ref = ${ref.trim().toLowerCase()}`
	);
	return r?.fingerprint ?? null;
}

export interface DeliveryRow {
	id: string;
	event: string;
	project: string | null;
	receivedAt: string;
	outcome: string | null;
	detail: string | null;
	ms: number | null;
}

export async function deliveries(
	projectId: string | null = null,
	limit = 100
): Promise<DeliveryRow[]> {
	const rows = await db()<
		{
			delivery_id: string;
			event: string;
			project: string | null;
			received_at: Date;
			o: Record<string, unknown>;
		}[]
	>`select d.delivery_id, d.event, p.owner || '/' || p.repo as project, d.received_at, to_jsonb(d) as o
		from webhook_delivery d left join project p on p.id = d.project_id
		where (${projectId}::bigint is null or d.project_id = ${projectId}::bigint)
		order by d.received_at desc limit ${limit}`;
	return rows.map((r) => ({
		id: r.delivery_id,
		event: r.event,
		project: r.project,
		receivedAt: r.received_at.toISOString(),
		outcome: (r.o.outcome as string | null) ?? null,
		detail: (r.o.detail as string | null) ?? null,
		ms: (r.o.ms as number | null) ?? null
	}));
}

/** Deliveries by outcome over the last day, with deliveries for no project counted apart. */
export async function deliverySummary(): Promise<{ outcome: string; n: number }[]> {
	return db()<{ outcome: string; n: number }[]>`
		select coalesce(case when project_id is null and event not like 'installation%' then 'no project' end,
			to_jsonb(d)->>'outcome', 'unrecorded') as outcome, count(*)::int as n
		from webhook_delivery d where received_at > now() - interval '1 day' group by 1 order by 2 desc`;
}

/** One project's operational state, for its page under Operations. */
export async function projectOps(projectId: string) {
	if (!/^\d+$/.test(projectId)) return null;
	const [p] = await db()<
		{
			id: string;
			owner: string;
			repo: string;
			tenant: string;
			tenant_id: string;
			installation_id: string;
			last_sync_at: Date | null;
			last_webhook_at: Date | null;
			last_error: string | null;
			sync_started_at: Date | null;
			o: Record<string, unknown>;
		}[]
	>`select p.id, p.owner, p.repo, tn.slug as tenant, p.tenant_id, p.installation_id, p.last_sync_at, p.last_webhook_at,
		p.last_error, p.sync_started_at, to_jsonb(p) as o
		from project p join tenant tn on tn.id = p.tenant_id where p.id = ${projectId}`;
	if (!p) return null;
	const held = await rows(
		() => db()<{ n: number; claimed: number; conflict: number; oldest: Date | null }[]>`
			select count(*)::int as n, count(*) filter (where claimed_at is not null)::int as claimed,
				count(*) filter (where conflict is not null)::int as conflict, min(created_at) as oldest
			from pending_edit where project_id = ${projectId}`
	);
	return {
		id: String(p.id),
		owner: p.owner,
		repo: p.repo,
		tenant: p.tenant,
		tenantId: String(p.tenant_id),
		installationId: String(p.installation_id),
		lastSyncAt: isoOf(p.last_sync_at),
		lastWebhookAt: isoOf(p.last_webhook_at),
		lastError: p.last_error,
		syncStartedAt: isoOf(p.sync_started_at),
		failingSince: (p.o.failing_since as string | null) ?? null,
		failCount: Number(p.o.fail_count ?? (p.last_error ? 1 : 0)),
		overLimit: !!p.o.over_limit,
		uninstalledAt: (p.o.uninstalled_at as string | null) ?? null,
		held: {
			n: held[0]?.n ?? 0,
			claimed: held[0]?.claimed ?? 0,
			conflict: held[0]?.conflict ?? 0,
			oldest: isoOf(held[0]?.oldest)
		},
		runs: await jobs({ projectId, limit: 30 }),
		deliveries: await deliveries(projectId, 30),
		edits: await rows(
			() => db()<
				{
					at: Date;
					op: string;
					item_id: string;
					login: string | null;
					error: string | null;
					pr_number: number | null;
				}[]
			>`
				select e.at, e.op, e.item_id, u.github_login as login, e.error, e.pr_number from edit_log e
				left join app_user u on u.id = e.user_id where e.project_id = ${projectId} order by e.at desc limit 30`
		)
	};
}

export async function budgets() {
	return rows(
		() => db()<
			{
				scope: string;
				resource: string;
				remaining: number;
				limit: number;
				reset_at: Date;
				updated_at: Date;
			}[]
		>`
			select scope, resource, remaining, "limit", reset_at, updated_at from github_budget order by scope, resource`
	);
}

/** Today's AI use against each tenant's allowance, and today's failures. */
export async function aiToday() {
	const usage = await db()<{ scope: string; tokens: number }[]>`
		select scope, tokens from inference_usage where day = current_date order by tokens desc limit 50`.catch(
		() => []
	);
	const failures = await rows(
		() => db()<{ kind: string; outcome: string; n: number }[]>`
			select kind, outcome, count(*)::int as n from job_run
			where kind in ('inference', 'ask') and started_at > current_date group by kind, outcome`
	);
	return { usage, failures };
}

/** What a project's own pages show about its sync (PM50) and its held edits (PM54). Cheap: one
 * row, ten runs and a count, on every project page. */
export async function projectSyncHealth(projectId: string) {
	const [p] = await db()<
		{ o: Record<string, unknown>; last_webhook_at: Date | null; sync_started_at: Date | null }[]
	>`select to_jsonb(p) as o, last_webhook_at, sync_started_at from project p where id = ${projectId}`;
	const runs = await rows(
		() => db()<
			{
				started_at: Date;
				ms: number | null;
				outcome: string;
				trigger: string | null;
				error: string | null;
			}[]
		>`
			select started_at, (extract(epoch from (ended_at - started_at)) * 1000)::int as ms, outcome, trigger, error
			from job_run where project_id = ${projectId} and kind = 'sync' order by started_at desc limit 10`
	);
	// Batched edits whose author must sign in again before they can be committed as them.
	const held = await rows(
		() => db()<{ login: string; n: number }[]>`
			select u.github_login as login, count(*)::int as n from pending_edit e join app_user u on u.id = e.user_id
			where e.project_id = ${projectId} and e.conflict is null and e.created_at < now() - interval '10 minutes'
			and (u.refresh_token_enc is null or u.refresh_token_expires_at < now() or (to_jsonb(u)->>'refresh_error') is not null)
			group by u.github_login`
	);
	return {
		failingSince: (p?.o.failing_since as string | null) ?? null,
		failCount: Number(p?.o.fail_count ?? 0),
		lastWebhookAt: isoOf(p?.last_webhook_at),
		syncing: !!p?.sync_started_at,
		runs: runs.map((r) => ({
			at: r.started_at.toISOString(),
			ms: r.ms,
			outcome: r.outcome,
			trigger: r.trigger,
			error: r.error
		})),
		held
	};
}

export interface FailedEdit {
	projectId: string;
	item: string;
	op: string;
	at: string;
	error: string;
}

/** A person's own edits that failed in the last week (PM54), unless they edited the item since
 * with success, so nobody is left wondering whether their change was saved. */
export async function failedEdits(
	userId: string,
	projectIds: string[],
	itemId: string | null = null
): Promise<FailedEdit[]> {
	if (!projectIds.length) return [];
	return (
		await db()<{ project_id: string; item_id: string; op: string; at: Date; error: string }[]>`
			select e.project_id, e.item_id, e.op, e.at, e.error from edit_log e
			where e.user_id = ${userId} and e.error is not null and e.at > now() - interval '7 days'
			and e.project_id in ${db()(projectIds)}
			and (${itemId}::text is null or e.item_id = ${itemId})
			and not exists (select 1 from edit_log l where l.project_id = e.project_id and l.item_id = e.item_id
				and l.user_id = e.user_id and l.error is null and l.at > e.at)
			order by e.at desc limit 20`
	).map((r) => ({
		projectId: String(r.project_id),
		item: r.item_id,
		op: r.op,
		at: r.at.toISOString(),
		error: r.error
	}));
}
