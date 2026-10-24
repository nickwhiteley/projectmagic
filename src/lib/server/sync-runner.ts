// When syncs run (spec §7.4), and never two at once for a project: a request while one runs
// marks the project to run once more when it finishes, so a burst of pushes is one or two syncs.
import { waitUntil } from '@vercel/functions';
import type { Config } from '#lib/core/config.ts';
import { db } from './db.ts';
import { settle } from './settle.ts';
import { asApp, installationClient } from './github-app.ts';
import { inferProject } from './inference.ts';
import { forgetState } from './project-state.ts';
import { initialiseRepo } from './init-repo.ts';
import { syncInstallations, syncProject, type SyncSummary } from './sync.ts';
import type { GitHubClient } from './github-client.ts';
import { errorText, isRateLimited, STUCK_MS } from '#lib/core/ops.ts';
import { failed, missingSchema, startJob, track } from './ops.ts';

interface Row {
	id: string;
	owner: string;
	repo: string;
	installation_id: string;
	config_json: Config | null;
}

/** Claims the project's sync, or asks the running one to go again. True when the caller runs it. */
async function claim(projectId: string): Promise<boolean> {
	const [r] = await db()<{ run: boolean }[]>`
		update project set
			sync_started_at = case when sync_started_at is null or sync_started_at < now() - ${`${STUCK_MS} milliseconds`}::interval
				then now() else sync_started_at end,
			sync_again = sync_started_at is not null and sync_started_at >= now() - ${`${STUCK_MS} milliseconds`}::interval
		where id = ${projectId}
		returning not sync_again as run`;
	return r?.run ?? false;
}

/** Releases the claim; true if another sync was asked for meanwhile, in which case it is kept. */
async function release(projectId: string): Promise<boolean> {
	const [r] = await db()<{ again: boolean }[]>`
		update project set
			sync_started_at = case when sync_again then now() else null end,
			sync_again = false
		where id = ${projectId}
		returning sync_started_at is not null as again`;
	return r?.again ?? false;
}

/** What started a sync, recorded with it (PM50). */
export type Trigger = 'webhook' | 'cron' | 'edit' | 'page' | 'claim' | 'refresh' | 'admin';

/** A GitHub client that counts its calls, for the sync's record. */
function counted(gh: GitHubClient): { gh: GitHubClient; calls: () => number } {
	let n = 0;
	return {
		gh: {
			graphql: (q, v) => (n++, gh.graphql(q, v)),
			rest: (path) => (n++, gh.rest(path)),
			send: (m, path, body) => (n++, gh.send(m, path, body))
		},
		calls: () => n
	};
}

async function runOnce(projectId: string, trigger: Trigger): Promise<SyncSummary | null> {
	const [p] = await db()<(Row & { last_sync_at: Date | null; last_webhook_at: Date | null })[]>`
		select id, owner, repo, installation_id, config_json, last_sync_at, last_webhook_at
		from project where id = ${projectId}`;
	if (!p) return null;
	const main = p.config_json?.main ?? 'main';
	const head = async () =>
		(
			await db()<{ head_oid: string }[]>`
				select head_oid from ref where project_id = ${projectId} and name = ${main}`
		)[0]?.head_oid ?? null;
	// A sync whose function died while it ran is marked, rather than left looking as if it runs.
	await db()`update job_run set outcome = 'stuck', ended_at = now(), error = 'never finished'
		where project_id = ${projectId} and kind = 'sync' and outcome = 'running'
		and started_at < now() - ${`${STUCK_MS} milliseconds`}::interval`.catch(() => {});
	const before = await head();
	const job = await startJob('sync', { projectId, trigger });
	const c = counted(installationClient(Number(p.installation_id)));
	try {
		const summary = await syncProject(c.gh, db(), {
			id: String(p.id),
			owner: p.owner,
			repo: p.repo,
			config: p.config_json
		});
		const after = await head();
		// The cron found main moved, and no webhook came since the last sync: GitHub's delivery was
		// lost or never sent (PM52).
		const missedWebhook =
			trigger === 'cron' &&
			!!before &&
			!!after &&
			before !== after &&
			(!p.last_webhook_at || (!!p.last_sync_at && p.last_webhook_at < p.last_sync_at));
		await db()`update project set failing_since = null, fail_count = 0 where id = ${projectId}`.catch(
			(e) => {
				if (!missingSchema(e)) throw e;
			}
		);
		// The App got a token for the installation, so a refusal recorded earlier is over (PM53).
		await db()`update installation set token_error = null, token_error_at = null
			where id = ${p.installation_id} and token_error is not null`.catch(() => {});
		await job.end('ok', undefined, { ...summary, calls: c.calls(), missedWebhook });
		return summary;
	} catch (e) {
		const message = errorText(e);
		await db()`update project set last_error = ${message} where id = ${projectId}`;
		await db()`update project set failing_since = coalesce(failing_since, now()), fail_count = fail_count + 1
			where id = ${projectId}`.catch(() => {});
		await job.end(isRateLimited(message) ? 'rate limited' : 'failed', e, { calls: c.calls() });
		return null;
	}
}

/** Syncs now, unless one is running, in which case that one runs again when it finishes. 'failed'
 * when the sync this call ran failed (PM47: the cron counted those as run). */
export async function syncNow(
	projectId: string,
	trigger: Trigger = 'refresh'
): Promise<'ran' | 'queued' | 'failed'> {
	if (!(await claim(projectId))) return 'queued';
	let ok: boolean;
	do ok = (await runOnce(projectId, trigger)) !== null;
	while (await release(projectId));
	// Proposed statuses (PM3) are asked for after the sync, in the background, a few at a time.
	waitUntil(
		inferProject(projectId)
			.then((n) => n && forgetState(projectId))
			.catch((e) => failed('inference', { projectId }, e))
	);
	return ok ? 'ran' : 'failed';
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Waits until no sync is running for the project, or until `until`. */
async function idle(projectId: string, until: number): Promise<void> {
	while (Date.now() < until) {
		const [r] = await db()<{ running: boolean }[]>`
			select sync_started_at is not null as running from project where id = ${projectId}`;
		if (!r?.running) return;
		await sleep(250);
	}
}

/** After an edit (PM17): syncs until the cache has `ref` at `oid`, for up to `limitMs`. */
export function syncUntil(
	projectId: string,
	ref: string,
	oid: string,
	limitMs = 10_000
): Promise<boolean> {
	const until = Date.now() + limitMs;
	return settle(
		{
			sync: () => syncNow(projectId, 'edit'),
			idle: () => idle(projectId, until),
			done: async () => {
				const [r] = await db()<{ head_oid: string }[]>`
					select head_oid from ref where project_id = ${projectId} and name = ${ref}`;
				return r?.head_oid === oid;
			},
			sleep,
			now: Date.now
		},
		limitMs
	);
}

/** Starts a sync without waiting for it; on Vercel the function stays alive until it ends. */
export function syncInBackground(projectId: string, trigger: Trigger): void {
	const p = syncNow(projectId, trigger).catch((e) => failed('sync', { projectId, trigger }, e));
	waitUntil(p);
}

export async function syncProjectList(): Promise<number> {
	return track(
		'project list',
		{},
		() => syncInstallations(asApp(), installationClient, db(), initialiseRepo),
		(n) => ({ projects: n })
	);
}

/** After a claim: list the installation's repositories as projects, then sync each. */
export async function syncAfterClaim(installationId: string): Promise<void> {
	await syncProjectList();
	const projects = await db()<{ id: string }[]>`
		select id from project where installation_id = ${installationId} and uninstalled_at is null`;
	for (const p of projects) syncInBackground(String(p.id), 'claim');
}

/** How long the cron spends syncing before it leaves the rest to the next run (§8.3). */
const CRON_BUDGET_MS = 40_000;

/** Every active tenant's projects, the ones synced longest ago first, until the time budget is
 * spent; webhooks keep active projects fresh in between. */
export async function syncAll(
	budgetMs = CRON_BUDGET_MS
): Promise<{ result: Record<string, string>; deferred: string[] }> {
	await syncProjectList();
	const until = Date.now() + budgetMs;
	const out: Record<string, string> = {};
	const deferred: string[] = [];
	// A suspended installation can't be read: its projects would fail every day (PM51 shows it).
	for (const p of await db()<
		{ id: string; owner: string; repo: string }[]
	>`select p.id, p.owner, p.repo from project p join tenant t on t.id = p.tenant_id
		left join installation i on i.id = p.installation_id
		where (to_jsonb(p)->>'uninstalled_at') is null and not p.over_limit and t.status = 'active'
		and i.suspended_at is null
		order by p.last_sync_at asc nulls first, p.id`) {
		if (Date.now() >= until) {
			out[`${p.owner}/${p.repo}`] = 'deferred';
			deferred.push(String(p.id));
			continue;
		}
		out[`${p.owner}/${p.repo}`] = await syncNow(String(p.id), 'cron');
	}
	return { result: out, deferred };
}

/** On page load (§7.4): a project whose last sync failed, or that has had no webhook for a day,
 * re-syncs in the background, at most every ten minutes. */
export async function revalidate(projectIds: string[]): Promise<void> {
	if (!projectIds.length) return;
	const stale = await db()<{ id: string }[]>`
		select id from project where id in ${db()(projectIds)}
		and sync_started_at is null
		and (last_sync_at is null or last_sync_at < now() - interval '10 minutes')
		and (last_error is not null or last_webhook_at is null or last_webhook_at < now() - interval '1 day')`;
	for (const p of stale) syncInBackground(String(p.id), 'page');
}
