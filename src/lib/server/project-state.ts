// Loads a project's state for the views: the refs and cached parses the sync stored, assembled by
// the pure core. Kept in memory per instance until the project syncs again.
import { parseConfig, type Config } from '#lib/core/config.ts';
import type { EpicDeclaration } from '#lib/core/epics.ts';
import type { Status } from '#lib/core/meta.ts';
import {
	assembleState,
	type ProjectState,
	type RefInput,
	type StoredBacklog,
	type StoredPlan
} from '#lib/core/state.ts';
import { listPending, overlayBacklog } from './batch.ts';
import { db } from './db.ts';
import { PARSER_VERSION, type Pr } from './sync.ts';
import { aiAllowedCached } from './plans.ts';

interface ProjectRow {
	id: string;
	owner: string;
	repo: string;
	installation_id: string;
	config_json: Config | null;
	last_sync_at: Date | null;
	last_error: string | null;
	tenant_id: string;
}

const cache = new Map<string, { key: string; state: ProjectState }>();
/** What the database holds for a project, read once per sync: pending edits change the state, not this. */
const inputs = new Map<string, { key: string; reads: unknown; inferences: unknown }>();

/**
 * The project's state for a project page's load, at most once per request (the layout and the page
 * both need it). It reads `params.repo` so SvelteKit knows the load depends on it: the hook has
 * already found the project, but without this a client-side navigation from one project to
 * another would not re-run the load, and the page would keep showing the first project (PM13).
 */
export function projectState(event: {
	locals: App.Locals;
	params: { repo?: string };
}): Promise<ProjectState> {
	const { locals, params } = event;
	if (!params.repo || !locals.project) throw new Error('projectState is for project routes');
	const id = locals.project.id;
	let p = locals.states.get(id);
	if (!p) locals.states.set(id, (p = loadProjectState(id)));
	return p;
}

/** Drops the cached state, after something other than a sync changed what it shows (PM3). */
export function forgetState(projectId: string): void {
	cache.delete(projectId);
	cache.delete(`${projectId}:saved`);
	inputs.delete(projectId);
}

/**
 * `pending: false` leaves out the pending batch edits (PM25): what an edit that is saved at once
 * must be built from, so it never carries someone else's unsaved edit to main.
 */
export async function loadProjectState(
	projectId: string,
	opts: { pending?: boolean } = {}
): Promise<ProjectState> {
	const withPending = opts.pending ?? true;
	const slot = withPending ? projectId : `${projectId}:saved`;
	const sql = db();
	const [p] = await sql<ProjectRow[]>`
		select id, owner, repo, installation_id, config_json, last_sync_at, last_error, tenant_id from project where id = ${projectId}`;
	if (!p) throw new Error(`no project ${projectId}`);
	const syncKey = `${p.last_sync_at?.toISOString() ?? ''}|${p.last_error ?? ''}`;
	// Pending edits (PM25) change what the views show, so they are part of the key.
	const pending = withPending ? await listPending(projectId) : [];
	// Proposed statuses are off for a tenant whose plan or admins turned AI off (specs/tenants.md §7.2).
	const ai = await aiAllowedCached(String(p.tenant_id));
	const key = `${ai ? 'ai' : 'noai'}|${syncKey}|${pending.map((e) => `${e.id}${e.conflict ? 'c' : ''}`).join(',')}`;
	const hit = cache.get(slot);
	if (hit?.key === key) return hit.state;

	const base = parseConfig(null, { name: p.repo, defaultBranch: 'main' }).config;
	// A config stored before a key existed lacks it: the defaults fill in (PM28).
	const config = p.config_json ? { ...base, ...p.config_json } : base;
	type RefRow = {
		name: string;
		head_oid: string;
		committed_at: Date;
		ahead: number;
		behind: number;
		active: boolean;
		pr_json: { message: string; prs: Pr[] };
	};
	type DoneRow = {
		item_id: string;
		title: string;
		last_body: string;
		removed_oid: string;
		removed_at: Date;
		pr_number: number | null;
		deleted_by: string | null;
		deleted_at: Date | null;
	};
	// Independent reads in parallel; parses only for active branches, the only ones the view uses.
	const readAll = () =>
		Promise.all([
			sql<RefRow[]>`select name, head_oid, committed_at, ahead, behind, active, pr_json
			from ref where project_id = ${projectId}`,
			sql<{ ref_name: string; path: string; oid: string }[]>`
			select ref_name, path, oid from ref_file where project_id = ${projectId}`,
			// An item is deleted, not shipped, when the last edit Project Magic made to it was a remove
			// that landed with this removal (PM24): before it reached main, or within ten minutes after,
			// allowing for clocks; and from the same PR, where the history knows the PR.
			sql<DoneRow[]>`select d.item_id, d.title, d.last_body, d.removed_oid, d.removed_at,
				d.pr_number, e.login as deleted_by, e.at as deleted_at
			from done_item d
			left join lateral (
				select e.op, e.at, e.pr_number, u.github_login as login from edit_log e
				left join app_user u on u.id = e.user_id
				where e.project_id = d.project_id and e.item_id = d.item_id and e.error is null
				order by e.at desc limit 1
			) e on e.op = 'remove' and e.at <= d.removed_at + interval '10 minutes'
				and (d.pr_number is null or e.pr_number is null or e.pr_number = d.pr_number)
			where d.project_id = ${projectId}`,
			sql<{ oid: string; kind: string; parsed_json: unknown }[]>`
			select distinct on (b.oid, b.kind) b.oid, b.kind, b.parsed_json
			from ref_file f
			join ref r on r.project_id = f.project_id and r.name = f.ref_name and r.active
			join blob_parse b on b.oid = f.oid and b.parser_version >= ${PARSER_VERSION}
			where f.project_id = ${projectId}`
		]);
	const readInferences = () =>
		sql<
			{ item_id: string; source: string; status: Status; waiting: string | null; model: string }[]
		>`select item_id, source, status, waiting, model from item_inference where project_id = ${projectId}`.catch(
			(e: { code?: string }) => {
				if (e?.code === '42P01') return [];
				throw e;
			}
		);
	let held = inputs.get(projectId);
	if (held?.key !== syncKey) {
		const [reads, inferences] = await Promise.all([readAll(), readInferences()]);
		inputs.set(projectId, (held = { key: syncKey, reads, inferences }));
	}
	const [refs, files, done, parses] = held.reads as Awaited<ReturnType<typeof readAll>>;
	const inferences = ai ? (held.inferences as Awaited<ReturnType<typeof readInferences>>) : [];
	const parsed = new Map(parses.map((r) => [`${r.kind}:${r.oid}`, r.parsed_json]));
	const fileOf = (ref: string, path: string) =>
		files.find((f) => f.ref_name === ref && f.path === path)?.oid;
	const configParse = (() => {
		const oid = fileOf(config.main, '.projectmagic.yml');
		return oid ? (parsed.get(`config:${oid}`) as { warnings: string[] } | undefined) : undefined;
	})();

	// Pending edits (PM25), replayed on main's backlog and bugs file.
	const installation = { owner: p.owner, repo: p.repo, installationId: Number(p.installation_id) };
	const overlay = async (path: string | undefined, file: string | null) => {
		const oid = path ? fileOf(config.main, path) : undefined;
		const mine = pending.filter((e) => e.file === file);
		return oid && mine.length
			? overlayBacklog(installation, config.main, oid, mine).catch((e) => {
					console.error(`pending edits ${p.owner}/${p.repo}:`, e);
					return null;
				})
			: null;
	};
	const mainBacklog = await overlay(
		config.backlog.find((path) => fileOf(config.main, path)),
		null
	);
	const mainBugs = config.bugs ? await overlay(config.bugs, config.bugs) : null;

	const refInputs: RefInput[] = refs.map((r) => {
		const backlogPath = config.backlog.find((path) => fileOf(r.name, path));
		const backlogOid = backlogPath ? fileOf(r.name, backlogPath) : undefined;
		const planOid = config.progress ? fileOf(r.name, config.progress) : undefined;
		const bugsOid = config.bugs ? fileOf(r.name, config.bugs) : undefined;
		const epicsOid =
			r.name === config.main && config.epics ? fileOf(r.name, config.epics) : undefined;
		return {
			name: r.name,
			headOid: r.head_oid,
			committedAt: r.committed_at.toISOString(),
			ahead: r.ahead,
			behind: r.behind,
			active: r.active,
			message: r.pr_json?.message ?? '',
			prs: r.pr_json?.prs ?? [],
			backlog:
				(r.name === config.main ? mainBacklog : null) ??
				(backlogOid
					? ((parsed.get(`backlog:${backlogOid}`) as StoredBacklog | undefined) ?? null)
					: null),
			bugs:
				(r.name === config.main ? mainBugs : null) ??
				(bugsOid
					? ((parsed.get(`backlog:${bugsOid}`) as StoredBacklog | undefined) ?? null)
					: null),
			epics: epicsOid
				? ((parsed.get(`epics:${epicsOid}`) as { epics: EpicDeclaration[] } | undefined)?.epics ??
					null)
				: null,
			plan: planOid ? ((parsed.get(`progress:${planOid}`) as StoredPlan | undefined) ?? null) : null
		};
	});

	const state = assembleState({
		owner: p.owner,
		repo: p.repo,
		config,
		configWarnings: configParse?.warnings ?? [],
		refs: refInputs,
		done: done.map((d) => ({
			itemId: d.item_id,
			title: d.title,
			lastBody: d.last_body,
			removedOid: d.removed_oid,
			removedAt: d.removed_at.toISOString(),
			prNumber: d.pr_number,
			deleted: d.deleted_at ? { by: d.deleted_by, at: d.deleted_at.toISOString() } : null
		})),
		inferences: inferences.map((i) => ({
			itemId: i.item_id,
			source: i.source,
			status: i.status,
			waiting: i.waiting,
			model: i.model
		})),
		lastSyncAt: p.last_sync_at?.toISOString() ?? null,
		lastError: p.last_error,
		now: Date.now()
	});
	cache.set(slot, { key, state });
	return state;
}
