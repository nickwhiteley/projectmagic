// The sync (spec §7): GitHub → the cache. Two GraphQL calls per repository (spike 0.1): branches
// with their PRs and the oids of the tracked files, then text only for blobs not already parsed.
// Parsing is keyed by blob oid. Then done detection walks main's new commits to the backlog.
// No SvelteKit imports: the GitHub clients and the database are passed in.
import { parseBacklog } from '#lib/core/backlog.ts';
import { defaults, parseConfig, type Config } from '#lib/core/config.ts';
import {
	advanceHistory,
	statusChanges,
	emptyHistory,
	type HistoryState,
	type Version
} from '#lib/core/history.ts';
import { saveEvents, syncDelivery } from './delivery-sync.ts';
import { parseEpicsFile } from '#lib/core/epics.ts';
import { parseProgress } from '#lib/core/progress.ts';
import type { PrInfo } from '#lib/core/state.ts';
import type postgres from 'postgres';
import type { GitHubClient } from './github-client.ts';

type Sql = postgres.Sql;

/**
 * Bump when a parser's output changes: every cached parse older than this is redone on the next
 * sync (§8). A parse at this version or newer is used, so a build that is a version behind (a
 * rollback, or a local run on another branch sharing the database) still reads what a newer one
 * cached instead of fighting it.
 */
export const PARSER_VERSION = 2;

const CONFIG_PATH = '.projectmagic.yml';

export type Pr = PrInfo;

interface RefNode {
	name: string;
	compare: { aheadBy: number; behindBy: number } | null;
	target: { oid: string; committedDate: string; messageHeadline: string } & Record<
		string,
		{ oid: string } | null | string
	>;
	associatedPullRequests: { nodes: Pr[] };
}

export interface Branch {
	name: string;
	headOid: string;
	committedAt: string;
	message: string;
	/** The branch's own commits not on main, and main's not on the branch. */
	ahead: number;
	behind: number;
	active: boolean;
	prs: Pr[];
	/** Tracked path → blob oid, for the files that exist on this branch. */
	files: Record<string, string>;
}

const refsQuery = (paths: string[]) => `
query($owner: String!, $name: String!, $main: String!, $after: String) {
  repository(owner: $owner, name: $name) {
    defaultBranchRef { name }
    refs(refPrefix: "refs/heads/", first: 100, after: $after) {
      pageInfo { hasNextPage endCursor }
      nodes {
        name
        compare(headRef: $main) { aheadBy behindBy }
        target { ... on Commit { oid committedDate messageHeadline
          ${paths.map((p, i) => `f${i}: file(path: ${JSON.stringify(p)}) { oid }`).join('\n          ')} } }
        associatedPullRequests(first: 5, orderBy: {field: UPDATED_AT, direction: DESC}) {
          nodes { number title body state isDraft url baseRefName headRefName createdAt mergedAt }
        }
      }
    }
  }
}`;

/** Query 1: every branch, paged past 100. */
export async function fetchBranches(
	gh: GitHubClient,
	owner: string,
	repo: string,
	main: string,
	paths: string[],
	activeDays: number,
	now = Date.now()
): Promise<{ defaultBranch: string; branches: Branch[] }> {
	const nodes: RefNode[] = [];
	let defaultBranch: string;
	let after: string | null = null;
	do {
		type R = {
			repository: {
				defaultBranchRef: { name: string } | null;
				refs: { pageInfo: { hasNextPage: boolean; endCursor: string }; nodes: RefNode[] };
			};
		};
		const r: R = await gh.graphql<R>(refsQuery(paths), { owner, name: repo, main, after });
		defaultBranch = r.repository.defaultBranchRef?.name ?? main;
		nodes.push(...r.repository.refs.nodes);
		after = r.repository.refs.pageInfo.hasNextPage ? r.repository.refs.pageInfo.endCursor : null;
	} while (after);

	const cutoff = now - activeDays * 86_400_000;
	return {
		defaultBranch,
		branches: nodes
			.filter((n) => n.target?.oid)
			.map((n) => {
				// compare's base is this branch and its head is main, so the branch's own commits
				// are main's `behindBy` (spike 0.1).
				const ahead = n.compare?.behindBy ?? 0;
				const behind = n.compare?.aheadBy ?? 0;
				// associatedPullRequests also lists PRs *into* this branch; only its own count.
				const prs = n.associatedPullRequests.nodes.filter((p) => p.headRefName === n.name);
				const files: Record<string, string> = {};
				paths.forEach((p, i) => {
					const f = n.target[`f${i}`];
					if (f && typeof f === 'object') files[p] = f.oid;
				});
				return {
					name: n.name,
					headOid: n.target.oid,
					committedAt: n.target.committedDate,
					message: n.target.messageHeadline,
					ahead,
					behind,
					prs,
					files,
					active:
						n.name === main ||
						prs.some((p) => p.state === 'OPEN') ||
						(ahead > 0 && Date.parse(n.target.committedDate) > cutoff)
				};
			})
	};
}

/** Query 2: blob text by oid, aliased in batches. A missing oid comes back absent. */
export async function fetchBlobs(
	gh: GitHubClient,
	owner: string,
	repo: string,
	oids: string[]
): Promise<Map<string, string>> {
	const out = new Map<string, string>();
	for (let i = 0; i < oids.length; i += 25) {
		const chunk = oids.slice(i, i + 25);
		const fields = chunk
			.map((o, j) => `b${j}: object(oid: ${JSON.stringify(o)}) { ... on Blob { text } }`)
			.join('\n');
		const r = await gh.graphql<{ repository: Record<string, { text: string | null } | null> }>(
			`query($owner: String!, $name: String!) { repository(owner: $owner, name: $name) { ${fields} } }`,
			{ owner, name: repo }
		);
		chunk.forEach((o, j) => {
			const t = r.repository[`b${j}`]?.text;
			if (typeof t === 'string') out.set(o, t);
		});
	}
	return out;
}

/** What is cached for a blob: the parse, in JSON form. */
export function parseBlob(
	kind: 'backlog' | 'progress' | 'config' | 'epics',
	text: string,
	repo: string,
	main: string
) {
	if (kind === 'epics') return { epics: parseEpicsFile(text) };
	if (kind === 'backlog') {
		const b = parseBacklog(text);
		// Each item's source, for the item view's branch diffs (§7.2).
		return {
			...b,
			preambleText: text.slice(b.preamble.start, b.preamble.end),
			items: b.items.map((it) => ({ ...it, source: text.slice(it.start, it.end) }))
		};
	}
	if (kind === 'progress') {
		const p = parseProgress(text);
		return {
			tasks: p.tasks,
			groups: p.groups,
			next: p.next?.number ?? null,
			unknown: p.unknown.map((t) => t.number)
		};
	}
	return parseConfig(text, { name: repo, defaultBranch: main });
}

export interface SyncProject {
	id: string;
	owner: string;
	repo: string;
	config: Config | null;
}

export interface SyncSummary {
	branches: number;
	active: number;
	parsed: number;
	newCommits: number;
	done: number;
	ms: number;
}

/** The tracked paths: the defaults, and whatever the configuration names. */
function trackedPaths(config: Config | null): string[] {
	const paths = new Set([
		'backlog.md',
		'BACKLOG.md',
		'PROGRESS.md',
		'epics.md',
		'bugs.md',
		CONFIG_PATH
	]);
	for (const p of config?.backlog ?? []) paths.add(p);
	if (config?.progress) paths.add(config.progress);
	if (config?.epics) paths.add(config.epics);
	if (config?.bugs) paths.add(config.bugs);
	return [...paths];
}

export async function syncProject(
	gh: GitHubClient,
	sql: Sql,
	project: SyncProject,
	now = Date.now()
): Promise<SyncSummary> {
	const t0 = performance.now();
	const { owner, repo } = project;
	const cached = async (oid: string, kind: string) =>
		(
			await sql`select 1 from blob_parse where oid = ${oid} and kind = ${kind}
				and parser_version >= ${PARSER_VERSION}`
		).length > 0;
	let parsed = 0;
	const store = async (
		oid: string,
		kind: 'backlog' | 'progress' | 'config' | 'epics',
		text: string,
		main: string
	) => {
		const json = parseBlob(kind, text, repo, main);
		await sql`insert into blob_parse (oid, kind, parsed_json, parser_version)
			values (${oid}, ${kind}, ${sql.json(JSON.parse(JSON.stringify(json)))}, ${PARSER_VERSION})
			on conflict (oid, kind) do update
			set parsed_json = excluded.parsed_json, parser_version = greatest(blob_parse.parser_version, excluded.parser_version)`;
		parsed++;
	};

	// 1. Branches, with the paths the last configuration named. If the configuration on main now
	// names other paths or another main, ask once more.
	let config = project.config;
	let main = config?.main ?? 'main';
	let paths = trackedPaths(config);
	let days = config?.activeBranchDays ?? 30;
	const fetched = await fetchBranches(gh, owner, repo, main, paths, days, now);
	const defaultBranch = fetched.defaultBranch;
	let branches = fetched.branches;
	for (let round = 0; round < 2; round++) {
		const mainRef =
			branches.find((b) => b.name === main) ?? branches.find((b) => b.name === defaultBranch);
		const configOid = mainRef?.files[CONFIG_PATH];
		let next: Config;
		if (configOid) {
			const [row] = await sql<{ parsed_json: { config: Config } }[]>`
				select parsed_json from blob_parse where oid = ${configOid} and kind = 'config'
				and parser_version >= ${PARSER_VERSION}`;
			// A config cached before a key existed lacks it: the defaults fill in (PM28).
			if (row) next = { ...defaults({ name: repo, defaultBranch }), ...row.parsed_json.config };
			else {
				const text = (await fetchBlobs(gh, owner, repo, [configOid])).get(configOid) ?? null;
				if (text !== null) await store(configOid, 'config', text, defaultBranch);
				next = parseConfig(text, { name: repo, defaultBranch }).config;
			}
		} else next = parseConfig(null, { name: repo, defaultBranch }).config;

		const nextPaths = trackedPaths(next);
		// Ask again when the branch compared against, the paths or the active window were wrong.
		const again =
			round === 0 &&
			(next.main !== main ||
				nextPaths.some((p) => !paths.includes(p)) ||
				next.activeBranchDays !== days);
		config = next;
		if (!again) break;
		main = next.main;
		paths = nextPaths;
		days = next.activeBranchDays;
		({ branches } = await fetchBranches(gh, owner, repo, main, paths, days, now));
	}
	const cfg = config!;
	const backlogPath = (b: Branch) => cfg.backlog.find((p) => b.files[p]);

	// 2. Text for the blobs on active branches that aren't parsed yet.
	const wanted = new Map<string, 'backlog' | 'progress' | 'epics'>();
	for (const b of branches.filter((x) => x.active)) {
		const bp = backlogPath(b);
		if (bp) wanted.set(b.files[bp], 'backlog');
		if (cfg.bugs && b.files[cfg.bugs]) wanted.set(b.files[cfg.bugs], 'backlog');
		if (cfg.progress && b.files[cfg.progress]) wanted.set(b.files[cfg.progress], 'progress');
		if (cfg.epics && b.name === main && b.files[cfg.epics]) wanted.set(b.files[cfg.epics], 'epics');
	}
	const missing: string[] = [];
	for (const [oid, kind] of wanted) if (!(await cached(oid, kind))) missing.push(oid);
	const texts = await fetchBlobs(gh, owner, repo, missing);
	for (const oid of missing) {
		const t = texts.get(oid);
		if (t !== undefined) await store(oid, wanted.get(oid)!, t, main);
	}

	// 3. The branches and their files, replacing the last sync's.
	await sql.begin(async (tx) => {
		await tx`delete from ref where project_id = ${project.id}`;
		await tx`delete from ref_file where project_id = ${project.id}`;
		const refs = branches.map((b) => ({
			project_id: project.id,
			name: b.name,
			head_oid: b.headOid,
			committed_at: b.committedAt,
			ahead: b.ahead,
			behind: b.behind,
			active: b.active,
			pr_json: JSON.parse(JSON.stringify({ message: b.message, prs: b.prs }))
		}));
		const files = branches.flatMap((b) =>
			Object.entries(b.files).map(([path, oid]) => ({
				project_id: project.id,
				ref_name: b.name,
				path,
				oid
			}))
		);
		if (refs.length) await tx`insert into ref ${tx(refs)}`;
		if (files.length) await tx`insert into ref_file ${tx(files)}`;
	});

	// 4. Done detection: main's commits to the backlog since the cursor (§7.3).
	const mainRef = branches.find((b) => b.name === main);
	// Both files are one list to done detection: an item removed from either shipped (PM29).
	const bugsPath = cfg.bugs && mainRef?.files[cfg.bugs] ? cfg.bugs : null;
	const history =
		mainRef && (backlogPath(mainRef) || bugsPath)
			? await syncHistory(
					gh,
					sql,
					project,
					main,
					[backlogPath(mainRef), bugsPath].filter((p): p is string => !!p)
				)
			: { newCommits: 0, done: 0 };

	await syncDelivery(gh, sql, project, cfg);

	await sql`update project set config_json = ${sql.json(JSON.parse(JSON.stringify(cfg)))},
		last_sync_at = now(), last_error = null where id = ${project.id}`;

	return {
		branches: branches.length,
		active: branches.filter((b) => b.active).length,
		parsed,
		...history,
		ms: Math.round(performance.now() - t0)
	};
}

interface CommitListItem {
	sha: string;
	parents: { sha: string }[];
	commit: { committer: { date: string } };
}

async function syncHistory(
	gh: GitHubClient,
	sql: Sql,
	project: SyncProject,
	main: string,
	paths: string[]
): Promise<{ newCommits: number; done: number }> {
	const { owner, repo } = project;
	const [cursor] = await sql<
		{
			last_commit_oid: string | null;
			present_json: Record<string, { title: string; text: string }>;
		}[]
	>`select last_commit_oid, present_json from history_cursor where project_id = ${project.id}`;

	// main's commits, newest first, until the cursor. GitHub has no first-parent filter, so the
	// first-parent line is rebuilt from the parents: commits from merged branches are not main's
	// history, and their intermediate backlogs would make ids look shipped that never were on
	// main. If the cursor isn't in main's history any more (a force push), start again.
	const commits = new Map<string, CommitListItem>();
	let head: string | null = null;
	let url: string | null =
		`/repos/${owner}/${repo}/commits?sha=${encodeURIComponent(main)}&per_page=100`;
	let found = false;
	while (url && !found) {
		const page: { body: CommitListItem[]; next: string | null } =
			await gh.rest<CommitListItem[]>(url);
		for (const c of page.body) {
			head ??= c.sha;
			if (c.sha === cursor?.last_commit_oid) found = true;
			commits.set(c.sha, c);
		}
		url = page.next;
	}
	const line: CommitListItem[] = [];
	for (let sha = head; sha && sha !== (found ? cursor!.last_commit_oid : null);) {
		const c = commits.get(sha);
		if (!c) break;
		line.push(c);
		sha = c.parents[0]?.sha ?? null;
	}
	line.reverse();
	let state: HistoryState =
		cursor && found
			? {
					present: new Map(Object.entries(cursor.present_json)),
					done: new Map(),
					lastOid: cursor.last_commit_oid
				}
			: emptyHistory();
	if (!line.length) return { newCommits: 0, done: 0 };

	// The backlog's blob at each commit; only the commits where it changed are versions.
	// With two files, a commit's version is both blobs together, so a change to either is a version.
	const oidAt = new Map<string, string | null>();
	const oidsAt = new Map<string, (string | null)[]>();
	for (let i = 0; i < line.length; i += 50) {
		const chunk = line.slice(i, i + 50);
		const fields = chunk
			.flatMap((c, j) =>
				paths.map(
					(path, k) =>
						`c${j}p${k}: object(expression: ${JSON.stringify(`${c.sha}:${path}`)}) { oid }`
				)
			)
			.join('\n');
		const r = await gh.graphql<{ repository: Record<string, { oid: string } | null> }>(
			`query($owner: String!, $name: String!) { repository(owner: $owner, name: $name) { ${fields} } }`,
			{ owner, name: repo }
		);
		chunk.forEach((c, j) => {
			const oids = paths.map((_, k) => r.repository[`c${j}p${k}`]?.oid ?? null);
			oidsAt.set(c.sha, oids);
			oidAt.set(c.sha, oids.some(Boolean) ? oids.join('+') : null);
		});
	}
	const changed = line.filter((c, i) => i === 0 || oidAt.get(c.sha) !== oidAt.get(line[i - 1].sha));
	const texts = await fetchBlobs(gh, owner, repo, [
		...new Set(changed.flatMap((c) => oidsAt.get(c.sha) ?? []).filter((o): o is string => !!o))
	]);
	const versions: Version[] = changed.map((c) => {
		const parts = (oidsAt.get(c.sha) ?? []).flatMap((o) => (o ? [texts.get(o) ?? ''] : []));
		return {
			oid: c.sha,
			date: c.commit.committer.date,
			pr: null,
			text: parts.length ? parts.join('\n\n') : null
		};
	});
	// The cursor is main's head, whether or not the head changed the backlog.
	const last = line[line.length - 1];
	if (versions[versions.length - 1]?.oid !== last.sha)
		versions.push({ oid: last.sha, date: last.commit.committer.date, pr: null, text: null });
	const changes = statusChanges(state, versions);
	state = advanceHistory(state, versions);

	// The PR that merged each newly done item's commit.
	const removals = [...new Set([...state.done.values()].map((d) => d.removedOid))];
	const prOf = new Map<string, number>();
	for (let i = 0; i < removals.length; i += 25) {
		const chunk = removals.slice(i, i + 25);
		const fields = chunk
			.map(
				(o, j) =>
					`p${j}: object(oid: ${JSON.stringify(o)}) { ... on Commit { associatedPullRequests(first: 1) { nodes { number } } } }`
			)
			.join('\n');
		const r = await gh.graphql<{
			repository: Record<
				string,
				{ associatedPullRequests?: { nodes: { number: number }[] } } | null
			>;
		}>(
			`query($owner: String!, $name: String!) { repository(owner: $owner, name: $name) { ${fields} } }`,
			{ owner, name: repo }
		);
		chunk.forEach((o, j) => {
			const n = r.repository[`p${j}`]?.associatedPullRequests?.nodes[0]?.number;
			if (n) prOf.set(o, n);
		});
	}

	await sql.begin(async (tx) => {
		if (!found) await tx`delete from done_item where project_id = ${project.id}`;
		const done = [...state.done.values()].map((d) => ({
			project_id: project.id,
			item_id: d.id,
			title: d.title,
			last_body: d.text,
			removed_oid: d.removedOid,
			removed_at: d.removedAt,
			pr_number: prOf.get(d.removedOid) ?? null
		}));
		if (done.length)
			await tx`insert into done_item ${tx(done)}
				on conflict (project_id, item_id) do update set title = excluded.title,
					last_body = excluded.last_body, removed_oid = excluded.removed_oid,
					removed_at = excluded.removed_at, pr_number = excluded.pr_number`;
		// An item that came back is no longer done.
		const present = [...state.present.keys()];
		if (present.length)
			await tx`delete from done_item where project_id = ${project.id} and item_id in ${tx(present)}`;
		await tx`insert into history_cursor (project_id, last_commit_oid, present_json)
			values (${project.id}, ${state.lastOid}, ${tx.json(Object.fromEntries(state.present))})
			on conflict (project_id) do update set last_commit_oid = excluded.last_commit_oid,
				present_json = excluded.present_json`;
	});
	// Every status change, for cycle time and the founder queue's ages (PM9). The rows are keyed, so
	// walking again from the start writes the same ones. Outside the transaction above: before the
	// migration the table is missing, which must not undo the cursor.
	try {
		if (!found) await sql`delete from event where project_id = ${project.id} and kind = 'status'`;
		await saveEvents(
			sql,
			project.id,
			changes.map((c) => ({
				kind: 'status' as const,
				key: `${c.id}@${c.oid}`,
				at: c.at,
				sha: c.oid,
				data: { id: c.id, from: c.from, to: c.to }
			}))
		);
	} catch (e) {
		if ((e as { code?: string })?.code !== '42P01') console.error('delivery: status changes:', e);
	}
	return { newCommits: line.length, done: state.done.size };
}

interface InstalledRepo {
	id: number;
	name: string;
	owner: { login: string };
	archived: boolean;
}

/** The project list is the set of repositories the App is installed on (§4). */
export async function syncInstallations(
	asApp: GitHubClient,
	forInstallation: (id: number) => GitHubClient,
	sql: Sql
): Promise<number> {
	const { body: installs } = await asApp.rest<{ id: number }[]>('/app/installations?per_page=100');
	let n = 0;
	for (const inst of installs) {
		const gh = forInstallation(inst.id);
		let url: string | null = '/installation/repositories?per_page=100';
		while (url) {
			const page: { body: { repositories: InstalledRepo[] }; next: string | null } = await gh.rest<{
				repositories: InstalledRepo[];
			}>(url);
			for (const r of page.body.repositories) {
				await sql`insert into project (github_repo_id, owner, repo, installation_id)
					values (${r.id}, ${r.owner.login}, ${r.name}, ${inst.id})
					on conflict (github_repo_id) do update set owner = excluded.owner, repo = excluded.repo,
						installation_id = excluded.installation_id`;
				n++;
			}
			url = page.next;
		}
	}
	return n;
}
