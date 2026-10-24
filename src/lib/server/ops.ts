// Recording Project Magic's own health (EP2, spec §22): errors, background work and the build that
// ran it. Every function here swallows its own failures: recording a fault must never cause one, and
// before migration 016 the tables aren't there (spec §2, "degrade, don't fail"). Each record is also
// one JSON line in the function's log, with the same id, for a log search or a log drain.
import { randomBytes } from 'node:crypto';
import { errorText, fingerprint } from '#lib/core/ops.ts';
import { db } from './db.ts';
import { setReporter } from './report.ts';

/** The deployed commit, short, or `dev`. Vercel sets these for each deployment. */
export function version(): string {
	return process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? 'dev';
}

/** When this build was made. */
export function builtAt(): string | null {
	return typeof __BUILT_AT__ === 'string' ? __BUILT_AT__ : null;
}

/** A table or column a later migration adds isn't there yet. */
export const missingSchema = (e: unknown): boolean =>
	['42P01', '42703'].includes((e as { code?: string })?.code ?? '');

let onFailure: (() => void) | null = null;
/** Called after a failure is recorded; the alerts (PM55) register here, which keeps this module
 * free of their imports. */
export function setFailureHook(hook: () => void): void {
	onFailure = hook;
}
const notify = () => {
	try {
		onFailure?.();
	} catch {
		// An alert check that can't start is not this caller's problem.
	}
};

/** One structured log line. */
export function log(
	level: 'info' | 'warn' | 'error',
	event: string,
	fields: Record<string, unknown> = {}
) {
	const line = JSON.stringify({ level, event, version: version(), ...fields });
	if (level === 'error') console.error(line);
	else if (level === 'warn') console.warn(line);
	else console.log(line);
}

/** A short reference a person can quote: eight letters and digits, without look-alikes. */
export function newRef(): string {
	const abc = 'abcdefghjkmnpqrstuvwxyz23456789';
	return [...randomBytes(8)].map((b) => abc[b % abc.length]).join('');
}

export interface ErrorRecord {
	source: 'server' | 'client';
	route: string | null;
	method?: string | null;
	status?: number | null;
	message: string;
	stack?: string | null;
	userId?: string | null;
	tenantId?: string | null;
	projectId?: string | null;
}

/** Records an error and returns its reference. Never throws. A resolved group that recurs reopens. */
export async function recordError(r: ErrorRecord): Promise<string> {
	const ref = newRef();
	const message = r.message.slice(0, 2000) || 'Error';
	const fp = fingerprint(r.source, r.route, message);
	log('error', `${r.source} error`, {
		ref,
		fingerprint: fp,
		route: r.route,
		method: r.method,
		status: r.status,
		message,
		stack: r.stack?.slice(0, 4000)
	});
	try {
		await db().begin(async (tx) => {
			await tx`
				insert into error_group (fingerprint, source, route, message)
				values (${fp}, ${r.source}, ${r.route}, ${message})
				on conflict (fingerprint) do update set last_seen = now(),
					occurrences = error_group.occurrences + 1, message = excluded.message,
					resolved_at = null, resolved_by = null`;
			await tx`
				insert into app_error (ref, fingerprint, source, route, method, status, message, stack,
					user_id, tenant_id, project_id, version)
				values (${ref}, ${fp}, ${r.source}, ${r.route}, ${r.method ?? null}, ${r.status ?? null},
					${message}, ${r.stack?.slice(0, 8000) ?? null}, ${r.userId ?? null}, ${r.tenantId ?? null},
					${r.projectId ?? null}, ${version()})`;
		});
	} catch (e) {
		if (!missingSchema(e)) log('warn', 'could not record error', { ref, error: errorText(e) });
	}
	notify();
	return ref;
}

export interface JobScope {
	projectId?: string | null;
	tenantId?: string | null;
	trigger?: string | null;
}

export type Outcome = 'ok' | 'failed' | 'skipped' | 'capped' | 'stuck' | 'rate limited';

export interface Job {
	id: string | null;
	end(outcome: Outcome, error?: unknown, detail?: Record<string, unknown>): Promise<void>;
}

/** Starts a job_run row; `end` finishes it. Never throws. */
export async function startJob(kind: string, scope: JobScope = {}): Promise<Job> {
	let id: string | null = null;
	try {
		const [r] = await db()<{ id: string }[]>`
			insert into job_run (kind, trigger, project_id, tenant_id, version)
			values (${kind}, ${scope.trigger ?? null}, ${scope.projectId ?? null}, ${scope.tenantId ?? null}, ${version()})
			returning id`;
		id = r ? String(r.id) : null;
	} catch (e) {
		if (!missingSchema(e)) log('warn', 'could not record job', { kind, error: errorText(e) });
	}
	const t0 = Date.now();
	return {
		id,
		async end(outcome, error, detail) {
			const text = error === undefined ? null : errorText(error);
			if (outcome !== 'ok' && outcome !== 'skipped')
				log(outcome === 'failed' ? 'error' : 'warn', `${kind} ${outcome}`, {
					job: id,
					...scope,
					error: text,
					ms: Date.now() - t0
				});
			if (outcome === 'failed' || outcome === 'stuck') notify();
			if (!id) return;
			try {
				await db()`update job_run set ended_at = now(), outcome = ${outcome}, error = ${text},
					detail_json = ${detail ? db().json(JSON.parse(JSON.stringify(detail))) : null}
					where id = ${id}`;
			} catch (e) {
				if (!missingSchema(e)) log('warn', 'could not finish job', { kind, error: errorText(e) });
			}
		}
	};
}

/** Runs `fn` as a recorded job. Its result is returned and its error rethrown. */
export async function track<T>(
	kind: string,
	scope: JobScope,
	fn: () => Promise<T>,
	detail?: (result: T) => Record<string, unknown> | undefined
): Promise<T> {
	const job = await startJob(kind, scope);
	try {
		const result = await fn();
		await job.end('ok', undefined, detail?.(result));
		return result;
	} catch (e) {
		await job.end('failed', e);
		throw e;
	}
}

/** Records a failure that was caught where it happened, in place of a bare `console.error`. */
export async function failed(
	kind: string,
	scope: JobScope,
	error: unknown,
	detail?: Record<string, unknown>
): Promise<void> {
	await (await startJob(kind, scope)).end('failed', error, detail);
}

/** Records work that was skipped and why, at most once a day per kind and scope (a missing table,
 * say), so it is visible without a row on every sync. */
export async function skipped(kind: string, scope: JobScope, reason: string): Promise<void> {
	try {
		const [seen] = await db()<{ n: number }[]>`
			select 1 as n from job_run where kind = ${kind} and outcome = 'skipped'
			and project_id is not distinct from ${scope.projectId ?? null}
			and started_at > now() - interval '1 day' limit 1`;
		if (!seen) await (await startJob(kind, scope)).end('skipped', reason);
	} catch {
		// Before migration 016: nothing to record into.
	}
}

// The sync's modules report through report.ts, which records here once the app has loaded this.
setReporter((kind, scope, error, detail) => void failed(kind, scope, error, detail));

/** The ops records past their keeping: 90 days. Run by the cron. */
export async function purgeOpsRecords(): Promise<Record<string, number>> {
	const out: Record<string, number> = {};
	for (const [table, column] of [
		['app_error', 'at'],
		['job_run', 'started_at'],
		['cron_run', 'started_at']
	] as const) {
		try {
			const r =
				await db()`delete from ${db()(table)} where ${db()(column)} < now() - interval '90 days'`;
			out[table] = r.count;
		} catch (e) {
			if (!missingSchema(e)) throw e;
		}
	}
	await db()`delete from error_group g where last_seen < now() - interval '90 days'
		and not exists (select 1 from app_error e where e.fingerprint = g.fingerprint)`.catch(() => {});
	await db()`delete from ops_alert where closed_at < now() - interval '90 days'`.catch(() => {});
	return out;
}
