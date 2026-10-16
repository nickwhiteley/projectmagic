import { visibleProjects } from '#lib/core/access.ts';
import { configured } from '#lib/server/inference.ts';
import { db } from '#lib/server/db.ts';
import { projectsFor } from '#lib/server/projects.ts';
import type { LayoutServerLoad } from './$types';
import { accessCtx } from '#lib/server/tenants.ts';
import { aiAllowedCached } from '#lib/server/plans.ts';

export const load: LayoutServerLoad = async ({ locals }) => {
	if (!locals.user) return { user: null, tenant: null, tenants: [], projects: [], ai: null };
	const projects = visibleProjects(locals.user, await projectsFor(locals), accessCtx(locals));
	// PM3's person-level opt-out; the table may not exist until the migration has run.
	const aiOn = !!locals.tenant && (await aiAllowedCached(locals.tenant.id));
	const [pref] =
		configured() && aiOn
			? await db()<{ ai_opt_out: boolean }[]>`
				select ai_opt_out from user_pref where user_id = ${locals.user.id}`.catch(() => [])
			: [];
	return {
		ai: configured() && aiOn ? { optedOut: !!pref?.ai_opt_out } : null,
		user: {
			login: locals.user.githubLogin,
			name: locals.user.name,
			admin: locals.user.platformRole === 'admin'
		},
		tenant: locals.tenant && {
			id: locals.tenant.id,
			name: locals.tenant.name,
			status: locals.tenant.status,
			admin: locals.tenant.role === 'admin',
			support: !!locals.tenant.support,
			until: locals.tenant.until ?? null
		},
		tenants: locals.tenants.map((t) => ({ id: t.id, name: t.name })),
		projects: projects.map((p) => ({
			repo: p.repo,
			param: p.param,
			name: p.name,
			hidden: p.hidden,
			failed: !!p.lastError
		}))
	};
};
