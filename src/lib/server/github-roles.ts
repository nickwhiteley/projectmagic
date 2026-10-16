// Project roles from GitHub (specs/tenants.md §6.1): what a person can reach on each of a tenant's
// installations, read with their own token, becomes `membership` rows with `source: github`. A
// manual row (an admin's override) is never touched. `can()` stays a pure function over rows.
import {
	planGithubRoles,
	roleFromPermissions,
	type RepoPermissions
} from '#lib/core/github-roles.ts';
import type { ProjectRole } from '#lib/core/access.ts';
import { db } from './db.ts';
import { GitHubError, type GitHubClient } from './github-client.ts';

/** How long a person's derived roles are trusted before they are read again, in the background. */
export const STALE_MS = 60 * 60_000;

export const githubRolesDue = (syncedAt: string | null, now = Date.now()): boolean =>
	!syncedAt || now - Date.parse(syncedAt) > STALE_MS;

/** Reads the person's role on every project of the tenant, from each installation they can reach. */
export async function refreshGithubRoles(
	gh: GitHubClient,
	userId: string,
	tenantId: string
): Promise<number> {
	const installs = await db()<{ id: string }[]>`
		select id from installation where tenant_id = ${tenantId} and removed_at is null`;
	const byRepo = new Map<string, string>(
		(
			await db()<{ id: string; github_repo_id: string }[]>`
				select id, github_repo_id from project where tenant_id = ${tenantId} and uninstalled_at is null`
		).map((p) => [String(p.github_repo_id), String(p.id)])
	);
	const reported = new Map<string, ProjectRole>();
	for (const inst of installs) {
		let url: string | null = `/user/installations/${inst.id}/repositories?per_page=100`;
		try {
			while (url) {
				const page: {
					body: { repositories: { id: number; permissions?: RepoPermissions }[] };
					next: string | null;
				} = await gh.rest(url);
				for (const r of page.body.repositories) {
					const projectId = byRepo.get(String(r.id));
					const role = roleFromPermissions(r.permissions);
					if (projectId && role) reported.set(projectId, role);
				}
				url = page.next;
			}
		} catch (e) {
			// They can't reach this installation (any more): nothing from it.
			if (!(e instanceof GitHubError && (e.status === 403 || e.status === 404))) throw e;
		}
	}
	const held = await db()<{ project_id: string; source: 'manual' | 'github'; role: string }[]>`
		select m.project_id, m.source, m.role from membership m join project p on p.id = m.project_id
		where m.user_id = ${userId} and p.tenant_id = ${tenantId}`;
	const plan = planGithubRoles(
		reported,
		held.map((h) => ({ projectId: String(h.project_id), source: h.source, role: h.role }))
	);
	await db().begin(async (tx) => {
		for (const u of plan.upsert)
			await tx`insert into membership (user_id, project_id, role, source, synced_at)
				values (${userId}, ${u.projectId}, ${u.role}, 'github', now())
				on conflict (user_id, project_id) do update set role = excluded.role, synced_at = now()
				where membership.source = 'github'`;
		if (plan.remove.length)
			await tx`delete from membership where user_id = ${userId} and source = 'github' and project_id in ${tx(plan.remove)}`;
		await tx`update tenant_member set github_synced_at = now() where tenant_id = ${tenantId} and user_id = ${userId}`;
	});
	return reported.size;
}

/** Claims the right to refresh this person's roles, so a burst of requests reads GitHub once. */
export async function claimGithubRefresh(userId: string, tenantId: string): Promise<boolean> {
	const [r] = await db()`
		update tenant_member set github_synced_at = now()
		where tenant_id = ${tenantId} and user_id = ${userId}
			and (github_synced_at is null or github_synced_at < now() - ${`${STALE_MS} milliseconds`}::interval)
		returning user_id`;
	return !!r;
}
