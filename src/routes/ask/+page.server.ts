import { visibleProjects } from '#lib/core/access.ts';
import { ask, MAX_QUESTION } from '#lib/server/ask.ts';
import { db } from '#lib/server/db.ts';
import { configured } from '#lib/server/inference.ts';
import { loadProjectState } from '#lib/server/project-state.ts';
import { projectsFor } from '#lib/server/projects.ts';
import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { accessCtx } from '#lib/server/tenants.ts';

export const load: PageServerLoad = async ({ locals }) => ({
	available: !!configured(),
	max: MAX_QUESTION,
	optedOut: await optedOut(locals.user!.id)
});

async function optedOut(userId: string): Promise<boolean> {
	const [r] = await db()<{ ai_opt_out: boolean }[]>`
		select ai_opt_out from user_pref where user_id = ${userId}`.catch(() => []);
	return !!r?.ai_opt_out;
}

export const actions: Actions = {
	default: async ({ locals, request }) => {
		const question = String((await request.formData()).get('q') ?? '');
		if (await optedOut(locals.user!.id))
			return fail(403, { question, reason: 'You have hidden AI features.' });
		// Projects that opted out of models are never sent (`inference: false`).
		const projects = visibleProjects(locals.user, await projectsFor(locals), accessCtx(locals));
		const states = (await Promise.all(projects.map((p) => loadProjectState(p.id)))).filter(
			(s) => s.hasBacklog && s.inferenceAllowed
		);
		const result = await ask(locals.user!.id, locals.user!.githubLogin, question, states);
		return result.ok ? { question, ...result } : fail(400, { question, reason: result.reason });
	}
};
