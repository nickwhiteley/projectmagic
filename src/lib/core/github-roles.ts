// Project roles from GitHub permissions (specs/tenants.md §6.1). Pure.
import type { ProjectRole } from './access.ts';

/** The `permissions` GitHub returns for a repository, as the signed-in person sees it. */
export interface RepoPermissions {
	admin?: boolean;
	maintain?: boolean;
	push?: boolean;
	triage?: boolean;
	pull?: boolean;
}

/** admin or maintain: maintainer. push: editor. pull or triage: viewer. Nothing: no access. */
export function roleFromPermissions(p: RepoPermissions | null | undefined): ProjectRole | null {
	if (!p) return null;
	if (p.admin || p.maintain) return 'maintainer';
	if (p.push) return 'editor';
	if (p.pull || p.triage) return 'viewer';
	return null;
}

/** What to write and what to remove, given the roles GitHub now reports and the rows held.
 * `held` are this person's rows for the tenant's projects; manual rows are never touched. */
export function planGithubRoles(
	reported: Map<string, ProjectRole>,
	held: { projectId: string; source: 'manual' | 'github'; role: string }[]
): { upsert: { projectId: string; role: ProjectRole }[]; remove: string[] } {
	const manual = new Set(held.filter((h) => h.source === 'manual').map((h) => h.projectId));
	const upsert = [...reported]
		.filter(([projectId]) => !manual.has(projectId))
		.map(([projectId, role]) => ({ projectId, role }));
	const remove = held
		.filter((h) => h.source === 'github' && !reported.has(h.projectId))
		.map((h) => h.projectId);
	return { upsert, remove };
}
