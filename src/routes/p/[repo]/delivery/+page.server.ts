import { loadDelivery } from '#lib/server/delivery.ts';
import { projectState } from '#lib/server/project-state.ts';
import { inline } from '#lib/server/views.ts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, params }) => {
	const s = await projectState({ locals, params });
	const d = await loadDelivery(s, locals.project!.id);
	const titleOf = new Map(s.items.map((i) => [i.id, i.titleText]));
	return {
		...d,
		// Kept to the figures' evidence: the lists that back them.
		leadTimes: d.leadTimes
			.slice(-15)
			.reverse()
			.map((t) => ({
				number: t.pr.number,
				title: t.pr.title,
				url: t.pr.url ?? null,
				hours: t.hours
			})),
		restores: d.restores.slice(0, 15).map((r) => ({
			number: r.pr.number,
			title: r.pr.title,
			url: r.pr.url ?? null,
			from: r.fromKind,
			hours: r.hours,
			deployed: r.deploy?.at ?? null
		})),
		founder: d.founder.map((f) => ({
			...f,
			titleHtml: inline(s, titleOf.get(f.id) ?? f.title),
			waitingHtml: f.waiting ? inline(s, f.waiting) : null
		})),
		githubDeployments: `https://github.com/${s.owner}/${s.repo}/deployments`,
		githubActions: `https://github.com/${s.owner}/${s.repo}/actions?query=branch%3A${encodeURIComponent(s.main)}`
	};
};
