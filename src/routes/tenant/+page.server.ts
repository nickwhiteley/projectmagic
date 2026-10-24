import { tenantProblems } from '#lib/core/ops.ts';
import { db } from '#lib/server/db.ts';
import { snapshot } from '#lib/server/ops-view.ts';
import { auditLog } from '#lib/server/platform.ts';
import { allProjects } from '#lib/server/projects.ts';
import { tenantUsage } from '#lib/server/tenants.ts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const t = locals.tenant!;
	const [snap, projects, [paused]] = await Promise.all([
		snapshot(t.id),
		allProjects(t.id),
		db()<{ n: number }[]>`select count(*)::int as n from project
			where tenant_id = ${t.id} and over_limit and (to_jsonb(project)->>'uninstalled_at') is null`
	]);
	const params = new Map(projects.map((p) => [`${p.owner}/${p.repo}`, p.param]));
	return {
		tenant: { name: t.name, slug: t.slug },
		usage: await tenantUsage(t.id),
		// What the tenant can put right themselves (PM54).
		problems: tenantProblems(snap, {
			paused: paused?.n ?? 0,
			repoParam: (owner, repo) => params.get(`${owner}/${repo}`) ?? repo
		}),
		recent: (await auditLog(t.id, 8)).map((a) => ({ at: a.at, actor: a.actor, action: a.action }))
	};
};
