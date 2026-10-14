// When syncs run (spec §7.4), and never two at once for a project: a request while one runs
// marks the project to run once more when it finishes, so a burst of pushes is one or two syncs.
import { waitUntil } from '@vercel/functions';
import type { Config } from '#lib/core/config.ts';
import { db } from './db.ts';
import { asApp, installationClient } from './github-app.ts';
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
	return 'ran';
}

/** Starts a sync without waiting for it; on Vercel the function stays alive until it ends. */
export function syncInBackground(projectId: string): void {
	const p = syncNow(projectId).catch((e) => console.error('sync', projectId, e));
	waitUntil(p);
}

export async function syncProjectList(): Promise<number> {
	return syncInstallations(asApp(), installationClient, db());
}

export async function syncAll(): Promise<Record<string, string>> {
	await syncProjectList();
	const out: Record<string, string> = {};
	for (const p of await db()<
		{ id: string; repo: string }[]
	>`select id, repo from project order by repo`)
		out[p.repo] = await syncNow(String(p.id));
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
