// Loads a project's state for the views: the refs and cached parses the sync stored, assembled by
// the pure core. Kept in memory per instance until the project syncs again.
import { parseConfig, type Config } from '#lib/core/config.ts';
import {
	assembleState,
	type ProjectState,
	type RefInput,
	type StoredBacklog,
	type StoredPlan
} from '#lib/core/state.ts';
import { db } from './db.ts';
import { PARSER_VERSION, type Pr } from './sync.ts';

interface ProjectRow {
	id: string;
	owner: string;
	repo: string;
	config_json: Config | null;
	last_sync_at: Date | null;
	last_error: string | null;
}

const cache = new Map<string, { key: string; state: ProjectState }>();

export async function loadProjectState(projectId: string): Promise<ProjectState> {
	const sql = db();
	const [p] = await sql<ProjectRow[]>`
		select id, owner, repo, config_json, last_sync_at, last_error from project where id = ${projectId}`;
	if (!p) throw new Error(`no project ${projectId}`);
	const key = `${p.last_sync_at?.toISOString() ?? ''}|${p.last_error ?? ''}`;
	const hit = cache.get(projectId);
	if (hit?.key === key) return hit.state;

	const config = p.config_json ?? parseConfig(null, { name: p.repo, defaultBranch: 'main' }).config;
	const refs = await sql<
		{
			name: string;
			head_oid: string;
			committed_at: Date;
			ahead: number;
			behind: number;
			active: boolean;
			pr_json: { message: string; prs: Pr[] };
		}[]
	>`select name, head_oid, committed_at, ahead, behind, active, pr_json from ref where project_id = ${projectId}`;
	const files = await sql<{ ref_name: string; path: string; oid: string }[]>`
		select ref_name, path, oid from ref_file where project_id = ${projectId}`;
	const oids = [...new Set(files.map((f) => f.oid))];
	const parses = oids.length
		? await sql<{ oid: string; kind: string; parsed_json: unknown }[]>`
			select oid, kind, parsed_json from blob_parse
			where oid in ${sql(oids)} and parser_version = ${PARSER_VERSION}`
		: [];
	const parsed = new Map(parses.map((r) => [`${r.kind}:${r.oid}`, r.parsed_json]));
	const fileOf = (ref: string, path: string) =>
		files.find((f) => f.ref_name === ref && f.path === path)?.oid;
	const configParse = (() => {
		const oid = fileOf(config.main, '.projectmagic.yml');
		return oid ? (parsed.get(`config:${oid}`) as { warnings: string[] } | undefined) : undefined;
	})();

	const refInputs: RefInput[] = refs.map((r) => {
		const backlogPath = config.backlog.find((path) => fileOf(r.name, path));
		const backlogOid = backlogPath ? fileOf(r.name, backlogPath) : undefined;
		const planOid = config.progress ? fileOf(r.name, config.progress) : undefined;
		return {
			name: r.name,
			headOid: r.head_oid,
			committedAt: r.committed_at.toISOString(),
			ahead: r.ahead,
			behind: r.behind,
			active: r.active,
			message: r.pr_json?.message ?? '',
			prs: r.pr_json?.prs ?? [],
			backlog: backlogOid
				? ((parsed.get(`backlog:${backlogOid}`) as StoredBacklog | undefined) ?? null)
				: null,
			plan: planOid ? ((parsed.get(`progress:${planOid}`) as StoredPlan | undefined) ?? null) : null
		};
	});
	const done = await sql<
		{
			item_id: string;
			title: string;
			last_body: string;
			removed_oid: string;
			removed_at: Date;
			pr_number: number | null;
		}[]
	>`select item_id, title, last_body, removed_oid, removed_at, pr_number from done_item where project_id = ${projectId}`;

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
			prNumber: d.pr_number
		})),
		lastSyncAt: p.last_sync_at?.toISOString() ?? null,
		lastError: p.last_error,
		now: Date.now()
	});
	cache.set(projectId, { key, state });
	return state;
}
