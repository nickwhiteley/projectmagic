// The sync's delivery fetches (PM9, spec §16.6): production deployments, merged PRs and CI runs on
// main, each stored once in `event` and read incrementally, newest first, until a page holds
// nothing new. Failures here never fail the sync; the Delivery view shows what it has.
import { prFacts } from '#lib/core/delivery.ts';
import { isProductionEnvironment, type Config } from '#lib/core/config.ts';
import type postgres from 'postgres';
import { GitHubError, type GitHubClient } from './github-client.ts';

type Sql = postgres.Sql;

interface Row {
	kind: 'deploy' | 'pr' | 'run' | 'status';
	key: string;
	at: string;
	sha: string | null;
	data: Record<string, unknown>;
}

const PAGES = 4;
const NEW_PRS_PER_SYNC = 60;
const JOBS_PER_SYNC = 30;
const FINAL = new Set(['success', 'failure', 'error', 'inactive']);

export async function saveEvents(sql: Sql, projectId: string, rows: Row[]): Promise<void> {
	for (let i = 0; i < rows.length; i += 200) {
		const chunk = rows.slice(i, i + 200).map((r) => ({
			project_id: projectId,
			kind: r.kind,
			key: r.key,
			at: r.at,
			sha: r.sha,
			data: sql.json(JSON.parse(JSON.stringify(r.data)))
		}));
		await sql`insert into event ${sql(chunk)}
			on conflict (project_id, kind, key) do update
			set at = excluded.at, sha = excluded.sha, data = excluded.data`;
	}
}

async function known(sql: Sql, projectId: string, kind: string, keys: string[]) {
	if (!keys.length) return new Map<string, Record<string, unknown>>();
	const rows = await sql<{ key: string; data: Record<string, unknown> }[]>`
		select key, data from event
		where project_id = ${projectId} and kind = ${kind} and key in ${sql(keys)}`;
	return new Map(rows.map((r) => [r.key, r.data]));
}

interface Deployment {
	id: number;
	sha: string;
	environment: string;
	created_at: string;
}

/** Vercel marks a deploy `inactive` once a newer one replaces it, so a success is a success if it
 * ever had one. Statuses are newest first. */
export function deploymentState(statuses: { state: string }[]): string {
	return statuses.some((s) => s.state === 'success')
		? 'success'
		: (statuses[0]?.state ?? 'pending');
}

/** A run started if any job ran a step; jobs that ran none never started (as when Actions billing
 * fails), which is not a failure of main (§16.1). */
export function runStarted(jobs: { steps?: unknown[] }[]): boolean {
	return jobs.some((j) => (j.steps?.length ?? 0) > 0);
}

async function syncDeploys(
	gh: GitHubClient,
	sql: Sql,
	projectId: string,
	base: string,
	config: Config
) {
	let url: string | null = `${base}/deployments?per_page=100`;
	for (let page = 0; url && page < PAGES; page++) {
		const res: { body: Deployment[]; next: string | null } = await gh.rest<Deployment[]>(url);
		const production = res.body.filter((d) => isProductionEnvironment(config, d.environment));
		const stored = await known(
			sql,
			projectId,
			'deploy',
			production.map((d) => String(d.id))
		);
		const fresh = production.filter((d) => !FINAL.has(String(stored.get(String(d.id))?.state)));
		const rows: Row[] = [];
		for (const d of fresh) {
			const statuses = (
				await gh.rest<{ state: string }[]>(`${base}/deployments/${d.id}/statuses?per_page=20`)
			).body;
			// Vercel marks a deploy `inactive` once a newer one replaces it, so a success is a
			// success if it ever had one.
			const state = deploymentState(statuses);
			rows.push({
				kind: 'deploy',
				key: String(d.id),
				at: d.created_at,
				sha: d.sha,
				data: { environment: d.environment, state }
			});
		}
		await saveEvents(sql, projectId, rows);
		// A page of deployments we already hold, final, means the older ones are held too.
		if (!fresh.length) break;
		url = res.next;
	}
}

interface Pull {
	number: number;
	title: string;
	body: string | null;
	html_url: string;
	created_at: string;
	merged_at: string | null;
	merge_commit_sha: string | null;
	head: { ref: string };
}

async function syncPrs(gh: GitHubClient, sql: Sql, projectId: string, base: string, main: string) {
	let url: string | null =
		`${base}/pulls?state=closed&base=${encodeURIComponent(main)}&sort=updated&direction=desc&per_page=100`;
	let added = 0;
	for (let page = 0; url && page < PAGES && added < NEW_PRS_PER_SYNC; page++) {
		const res: { body: Pull[]; next: string | null } = await gh.rest<Pull[]>(url);
		const merged = res.body.filter((p) => p.merged_at);
		const stored = await known(
			sql,
			projectId,
			'pr',
			merged.map((p) => String(p.number))
		);
		const fresh = merged
			.filter((p) => !stored.has(String(p.number)))
			.slice(0, NEW_PRS_PER_SYNC - added);
		const rows: Row[] = [];
		for (const p of fresh) {
			const first = (
				await gh.rest<{ commit: { author: { date: string } | null } }[]>(
					`${base}/pulls/${p.number}/commits?per_page=1`
				)
			).body[0]?.commit.author?.date;
			rows.push({
				kind: 'pr',
				key: String(p.number),
				at: p.merged_at!,
				sha: p.merge_commit_sha,
				data: {
					title: p.title,
					createdAt: p.created_at,
					firstCommitAt: first ?? null,
					head: p.head.ref,
					url: p.html_url,
					...prFacts(p.body)
				}
			});
		}
		await saveEvents(sql, projectId, rows);
		added += rows.length;
		if (!fresh.length) break;
		url = res.next;
	}
}

interface Run {
	id: number;
	head_sha: string;
	conclusion: string | null;
	created_at: string;
}
interface Job {
	steps?: unknown[];
}

async function syncRuns(gh: GitHubClient, sql: Sql, projectId: string, base: string, main: string) {
	let url: string | null =
		`${base}/actions/runs?branch=${encodeURIComponent(main)}&status=completed&per_page=100`;
	let jobs = 0;
	for (let page = 0; url && page < PAGES; page++) {
		const res: { body: { workflow_runs: Run[] }; next: string | null } = await gh.rest<{
			workflow_runs: Run[];
		}>(url);
		const runs = res.body.workflow_runs;
		const stored = await known(
			sql,
			projectId,
			'run',
			runs.map((r) => String(r.id))
		);
		const fresh = runs.filter((r) => !stored.has(String(r.id)));
		const rows: Row[] = [];
		for (const r of fresh) {
			let started = true;
			// A failed run whose jobs ran no steps never started (as when Actions billing fails): that
			// is not a failure of main, so it is marked and left out of the figures (§16.1).
			if (r.conclusion === 'failure') {
				// Past this sync's budget for job checks, a failed run is left for the next sync
				// rather than stored unchecked, so one that never started is never counted.
				if (jobs >= JOBS_PER_SYNC) continue;
				jobs++;
				const list = (
					await gh.rest<{ jobs: Job[] }>(`${base}/actions/runs/${r.id}/jobs?per_page=100`)
				).body.jobs;
				started = runStarted(list);
			}
			rows.push({
				kind: 'run',
				key: String(r.id),
				at: r.created_at,
				sha: r.head_sha,
				data: { conclusion: r.conclusion ?? 'unknown', started }
			});
		}
		await saveEvents(sql, projectId, rows);
		if (!fresh.length) break;
		url = res.next;
	}
}

/** The App permission each fetch needs (README, "Repository permissions"). */
const PERMISSION: Record<string, string> = {
	deploys: 'Deployments',
	'pull requests': 'Pull requests',
	'CI runs': 'Actions'
};

/** The log line for a failed fetch. GitHub's 403 "Resource not accessible by integration" means
 * the installation lacks a permission, often one added to the App but not yet accepted, so the
 * line says which one and where to accept it. */
export function deliveryError(what: string, repo: string, e: unknown): string {
	const message = e instanceof Error ? e.message : String(e);
	if (
		e instanceof GitHubError &&
		e.status === 403 &&
		message.includes('Resource not accessible by integration') &&
		PERMISSION[what]
	)
		return (
			`delivery: ${what} for ${repo}: the GitHub App installation needs ${PERMISSION[what]}: read. ` +
			`Add it in the App's permissions, then accept the pending permissions under ` +
			`Settings → Applications → Installed GitHub Apps. (${message})`
		);
	return `delivery: ${what} for ${repo}: ${message}`;
}

/** All three, each on its own: one failing leaves the others, and the sync, alone. */
export async function syncDelivery(
	gh: GitHubClient,
	sql: Sql,
	project: { id: string; owner: string; repo: string },
	config: Config
): Promise<void> {
	const base = `/repos/${project.owner}/${project.repo}`;
	const steps: [string, () => Promise<void>][] = [
		['deploys', () => syncDeploys(gh, sql, project.id, base, config)],
		['pull requests', () => syncPrs(gh, sql, project.id, base, config.main)],
		['CI runs', () => syncRuns(gh, sql, project.id, base, config.main)]
	];
	for (const [what, run] of steps) {
		try {
			await run();
		} catch (e) {
			// Before the migration the table isn't there; that is not worth a log line each sync.
			if ((e as { code?: string })?.code === '42P01') return;
			console.error(deliveryError(what, `${project.owner}/${project.repo}`, e));
		}
	}
}
