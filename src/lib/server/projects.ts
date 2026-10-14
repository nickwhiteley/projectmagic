// Projects as the database holds them: one per repository the App is installed on (spec §4).
import type { Project } from '#lib/core/access.ts';
import { db } from './db.ts';

export interface ProjectRow extends Project {
	owner: string;
	repo: string;
	installationId: number;
	lastSyncAt: string | null;
	lastError: string | null;
}

interface Row {
	id: string;
	owner: string;
	repo: string;
	installation_id: string;
	hidden: boolean;
	last_sync_at: Date | null;
	last_error: string | null;
}

const toProject = (r: Row): ProjectRow => ({
	id: String(r.id),
	owner: r.owner,
	repo: r.repo,
	installationId: Number(r.installation_id),
	hidden: r.hidden,
	lastSyncAt: r.last_sync_at?.toISOString() ?? null,
	lastError: r.last_error
});

export async function allProjects(): Promise<ProjectRow[]> {
	const rows = await db()<Row[]>`
		select id, owner, repo, installation_id, hidden, last_sync_at, last_error
		from project order by lower(repo)`;
	return rows.map(toProject);
}

export async function projectByName(owner: string, repo: string): Promise<ProjectRow | null> {
	const [r] = await db()<Row[]>`
		select id, owner, repo, installation_id, hidden, last_sync_at, last_error
		from project where lower(owner) = lower(${owner}) and lower(repo) = lower(${repo})`;
	return r ? toProject(r) : null;
}
