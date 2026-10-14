// Projects as the database holds them: one per repository the App is installed on (spec §4).
import type { Project } from '#lib/core/access.ts';
import { db } from './db.ts';

export interface ProjectRow extends Project {
	owner: string;
	repo: string;
	/** `name` from .projectmagic.yml, else the repository's. */
	name: string;
	installationId: number;
	lastSyncAt: string | null;
	lastError: string | null;
	/** What the last edit left behind (§10.2): null when edits flow straight to main. */
	edits: { state: string; detail: string | null; pr: number | null } | null;
}

interface Row {
	id: string;
	owner: string;
	repo: string;
	installation_id: string;
	hidden: boolean;
	last_sync_at: Date | null;
	last_error: string | null;
	name: string | null;
	edit_state: string | null;
	edit_detail: string | null;
	edit_pr: number | null;
}

const toProject = (r: Row): ProjectRow => ({
	id: String(r.id),
	owner: r.owner,
	repo: r.repo,
	name: r.name ?? r.repo,
	installationId: Number(r.installation_id),
	hidden: r.hidden,
	lastSyncAt: r.last_sync_at?.toISOString() ?? null,
	lastError: r.last_error,
	edits: r.edit_state ? { state: r.edit_state, detail: r.edit_detail, pr: r.edit_pr } : null
});

export async function allProjects(): Promise<ProjectRow[]> {
	const rows = await db()<Row[]>`
		select id, owner, repo, installation_id, hidden, last_sync_at, last_error, config_json->>'name' as name, edit_state, edit_detail, edit_pr
		from project order by lower(repo)`;
	return rows.map(toProject);
}

/** Projects are addressed by repository name, `/p/{repo}` (§9). If two owners ever share a
 * name, neither is found, rather than the wrong one. */
export async function projectByRepo(repo: string): Promise<ProjectRow | null> {
	const rows = await db()<Row[]>`
		select id, owner, repo, installation_id, hidden, last_sync_at, last_error, config_json->>'name' as name, edit_state, edit_detail, edit_pr
		from project where lower(repo) = lower(${repo})`;
	return rows.length === 1 ? toProject(rows[0]) : null;
}

export async function projectByGitHubId(githubRepoId: number): Promise<ProjectRow | null> {
	const [r] = await db()<Row[]>`
		select id, owner, repo, installation_id, hidden, last_sync_at, last_error, config_json->>'name' as name, edit_state, edit_detail, edit_pr
		from project where github_repo_id = ${githubRepoId}`;
	return r ? toProject(r) : null;
}
