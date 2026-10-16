// Projects as the database holds them: one per repository the App is installed on (spec §4).
import { parseRepoParam, repoParam, type Project } from '#lib/core/access.ts';
import { db } from './db.ts';

export interface ProjectRow extends Project {
	owner: string;
	repo: string;
	/** `name` from .projectmagic.yml, else the repository's. */
	name: string;
	installationId: number;
	/** Beyond the tenant's plan: listed on its Installations page, not shown or synced. */
	overLimit: boolean;
	/** How the project is addressed in `/p/{param}`: the repository name, or `owner--repo` where
	 * its tenant has two of that name (specs/tenants.md §5). */
	param: string;
	lastSyncAt: string | null;
	lastError: string | null;
	/** What the last edit left behind (§10.2): null when edits flow straight to main. */
	edits: { state: string; detail: string | null; pr: number | null } | null;
}

interface Row {
	id: string;
	tenant_id: string;
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
	over_limit: boolean;
}

const toProject = (r: Row): ProjectRow => ({
	id: String(r.id),
	overLimit: r.over_limit,
	tenantId: String(r.tenant_id),
	param: r.repo,
	owner: r.owner,
	repo: r.repo,
	name: r.name ?? r.repo,
	installationId: Number(r.installation_id),
	hidden: r.hidden,
	lastSyncAt: r.last_sync_at?.toISOString() ?? null,
	lastError: r.last_error,
	edits: r.edit_state ? { state: r.edit_state, detail: r.edit_detail, pr: r.edit_pr } : null
});

const COLUMNS = `id, tenant_id, owner, repo, installation_id, hidden, last_sync_at, last_error, config_json->>'name' as name, edit_state, edit_detail, edit_pr, over_limit`;

// `(to_jsonb(p)->>'uninstalled_at') is null`: still in the GitHub App.
/** A tenant's projects. Every lookup takes the tenant: nothing here reads across tenants. */
export async function allProjects(tenantId: string): Promise<ProjectRow[]> {
	const rows = await db()<Row[]>`
		select ${db().unsafe(COLUMNS)}
		from project p where tenant_id = ${tenantId} and (to_jsonb(p)->>'uninstalled_at') is null and not over_limit
		order by lower(repo), lower(owner)`;
	const projects = rows.map(toProject);
	for (const p of projects) p.param = repoParam(p, projects);
	return projects;
}

/** A project of this tenant by its address, `/p/{repo}` or `/p/{owner}--{repo}` (§5). A bare name
 * two projects share finds neither, rather than the wrong one. */
export async function projectByRepo(tenantId: string, param: string): Promise<ProjectRow | null> {
	const projects = await allProjects(tenantId);
	const bare = projects.filter((p) => p.repo.toLowerCase() === param.toLowerCase());
	if (bare.length === 1) return bare[0];
	if (bare.length > 1) return null;
	const { owner, repo } = parseRepoParam(param);
	if (!owner) return null;
	return (
		projects.find(
			(p) =>
				p.owner.toLowerCase() === owner.toLowerCase() && p.repo.toLowerCase() === repo.toLowerCase()
		) ?? null
	);
}

/** Which of these tenants have a project at this address: for a link from another of your tenants. */
export async function tenantsWithRepo(tenantIds: string[], param: string): Promise<string[]> {
	const found: string[] = [];
	for (const id of tenantIds) if (await projectByRepo(id, param)) found.push(id);
	return found;
}

/** For the webhook, which knows only GitHub's repository id: not scoped to a tenant. */
export async function projectByGitHubId(githubRepoId: number): Promise<ProjectRow | null> {
	const [r] = await db()<Row[]>`
		select ${db().unsafe(COLUMNS)} from project where github_repo_id = ${githubRepoId}`;
	return r ? toProject(r) : null;
}

/** The current tenant's projects, or none if the user has no tenant. */
export const projectsFor = (locals: { tenant: { id: string } | null }): Promise<ProjectRow[]> =>
	locals.tenant ? allProjects(locals.tenant.id) : Promise.resolve([]);

/** For the cron: every live project of every active tenant. The one lookup not scoped to a
 * tenant, because the cron serves them all. */
export async function activeProjects(): Promise<ProjectRow[]> {
	const rows = await db()<Row[]>`
		select ${db().unsafe(COLUMNS)} from project p
		where (to_jsonb(p)->>'uninstalled_at') is null and not over_limit
			and tenant_id in (select id from tenant where status = 'active')
		order by last_sync_at asc nulls first`;
	return rows.map(toProject);
}
