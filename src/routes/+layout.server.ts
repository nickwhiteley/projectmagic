import { visibleProjects } from '#lib/core/access.ts';
import { configured } from '#lib/server/inference.ts';
import { db } from '#lib/server/db.ts';
import { allProjects } from '#lib/server/projects.ts';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals }) => {
	if (!locals.user) return { user: null, projects: [], ai: null };
	const projects = visibleProjects(locals.user, await allProjects(), locals.memberships);
	// PM3's person-level opt-out; the table may not exist until the migration has run.
	const [pref] = configured()
		? await db()<{ ai_opt_out: boolean }[]>`
				select ai_opt_out from user_pref where user_id = ${locals.user.id}`.catch(() => [])
		: [];
	return {
		ai: configured() ? { optedOut: !!pref?.ai_opt_out } : null,
		user: {
			login: locals.user.githubLogin,
			name: locals.user.name,
			admin: locals.user.systemRole === 'admin'
		},
		projects: projects.map((p) => ({
			repo: p.repo,
			name: p.name,
			hidden: p.hidden,
			failed: !!p.lastError
		}))
	};
};
