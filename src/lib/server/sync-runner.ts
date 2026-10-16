// When syncs run (spec §7.4), and never two at once for a project: a request while one runs
// marks the project to run once more when it finishes, so a burst of pushes is one or two syncs.
import { waitUntil } from '@vercel/functions';
import type { Config } from '#lib/core/config.ts';
import { db } from './db.ts';
import { settle } from './settle.ts';
import { asApp, installationClient } from './github-app.ts';
import { inferProject } from './inference.ts';
import { forgetState } from './project-state.ts';
import { syncInstallations, syncProject, type SyncSummary } from './sync.ts';

/** A sync that has run this long is presumed dead, and another may start. */
const STUCK_MS = 5 * 60_000;

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

async function runOnce(projectId: string): Promise<SyncSummary | null> {
	const [p] = await db()<Row[]>`
		select id, owner, repo, installation_id, config_json from project where id = ${projectId}`;
	if (!p) return null;
	try {
		return await syncProject(installationClient(Number(p.installation_id)), db(), {
			id: String(p.id),
			owner: p.owner,
			repo: p.repo,
			config: p.config_json
		});
	} catch (e) {
		await db()`update project set last_error = ${e instanceof Error ? e.message : String(e)}
			where id = ${projectId}`;
		console.error(`sync ${p.owner}/${p.repo}:`, e);
		return null;
	}
}

/** Syncs now, unless one is running, in which case that one runs again when it finishes. */
export async function syncNow(projectId: string): Promise<'ran' | 'queued'> {
	if (!(await claim(projectId))) return 'queued';
	do await runOnce(projectId);
	while (await release(projectId));
	// Proposed statuses (PM3) are asked for after the sync, in the background, a few at a time.
	waitUntil(
		inferProject(projectId)
			.then((n) => n && forgetState(projectId))
			.catch((e) => console.error('inference', projectId, e instanceof Error ? e.message : e))
	);
	return 'ran';
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
			sync: () => syncNow(projectId),
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
export function syncInBackground(projectId: string): void {
	const p = syncNow(projectId).catch((e) => console.error('sync', projectId, e));
	waitUntil(p);
}

export async function syncProjectList(): Promise<number> {
	return syncInstallations(asApp(), installationClient, db());
}

/** How long the cron spends syncing before it leaves the rest to the next run (§8.3). */
const CRON_BUDGET_MS = 40_000;

/** Every active tenant's projects, the ones synced longest ago first, until the time budget is
 * spent; webhooks keep active projects fresh in between. */
export async function syncAll(budgetMs = CRON_BUDGET_MS): Promise<Record<string, string>> {
	await syncProjectList();
	const until = Date.now() + budgetMs;
	const out: Record<string, string> = {};
	for (const p of await db()<
		{ id: string; owner: string; repo: string }[]
	>`select p.id, p.owner, p.repo from project p join tenant t on t.id = p.tenant_id
		where (to_jsonb(p)->>'uninstalled_at') is null and t.status = 'active'
		order by p.last_sync_at asc nulls first, p.id`) {
		if (Date.now() >= until) {
			out[`${p.owner}/${p.repo}`] = 'deferred';
			continue;
		}
		out[`${p.owner}/${p.repo}`] = await syncNow(String(p.id));
	}
	return out;
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
	for (const p of stale) syncInBackground(String(p.id));
}
