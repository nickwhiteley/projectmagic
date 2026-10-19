import { can } from '#lib/core/access.ts';
import { epicStatus, isCrossEpic } from '#lib/core/epics.ts';
import { parseRef } from '#lib/core/crossref.ts';
import type { Status } from '#lib/core/meta.ts';
import { epicMembers } from '#lib/server/cross.ts';
import { neighbours, projectState } from '#lib/server/project-state.ts';
import { accessCtx } from '#lib/server/tenants.ts';
import { inline, md } from '#lib/server/views.ts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, params }) => {
	const [s, ns] = await Promise.all([projectState({ locals, params }), neighbours(locals)]);
	const here = locals.project!;
	const byId = new Map(s.items.map((i) => [i.id, i]));
	const shipped = new Map(s.done.map((d) => [d.id, d]));
	// Items in other repositories that join these epics with `Epic: <this repo>:EP3` (PM36).
	const members = epicMembers(ns, here);
	// Where a new item for an epic can go: this project and the others this person can edit.
	const ctx = accessCtx(locals);
	const addTo = [
		...(s.hasBacklog ? [{ repo: here.param, name: here.name, here: true }] : []),
		...ns
			.filter((n) => n.state.hasBacklog && can(locals.user, 'edit', { ...ctx, project: n.project }))
			.map((n) => ({ repo: n.project.param, name: n.project.name, here: false }))
	];
	// An epic only other repositories' items name is listed too, as not declared.
	const rollups = [
		...s.epics,
		...[...members.keys()]
			.filter((id) => !s.epics.some((e) => e.id === id))
			.map((id) => ({
				id,
				title: null,
				description: '',
				target: null,
				declared: false,
				counts: {},
				total: 0,
				items: [],
				shipped: []
			}))
	];
	const epics = rollups.map((e) => {
		const elsewhere = members.get(e.id) ?? [];
		const counts: Partial<Record<Status, number>> = { ...e.counts };
		for (const m of elsewhere) counts[m.status] = (counts[m.status] ?? 0) + 1;
		const statuses = [
			...e.items.map((id) => byId.get(id)?.status ?? 'todo'),
			...e.shipped.map(() => 'done' as const),
			...elsewhere.map((m) => m.status)
		];
		return {
			id: e.id,
			title: e.title,
			descriptionHtml: e.description ? md(s, e.description) : '',
			target: e.target,
			declared: e.declared,
			hasItem: byId.has(e.id),
			status: epicStatus(statuses),
			counts,
			total: e.total + elsewhere.length,
			repos: new Set(elsewhere.map((m) => m.repo)).size + (e.total ? 1 : 0),
			items: e.items.flatMap((id) => {
				const i = byId.get(id);
				return i ? [{ id, titleHtml: inline(s, i.title), status: i.status }] : [];
			}),
			shipped: e.shipped.flatMap((id) => {
				const d = shipped.get(id);
				return d ? [{ id, title: d.title }] : [];
			}),
			elsewhere
		};
	});
	// This project's items in other repositories' epics, by epic.
	const joined = new Map<string, { id: string; title: string; status: Status }[]>();
	for (const i of s.items)
		if (isCrossEpic(i.epic))
			joined.set(i.epic!, [
				...(joined.get(i.epic!) ?? []),
				{ id: i.id, title: i.titleText, status: i.status }
			]);
	const elsewhereEpics = [...joined].map(([epic, items]) => {
		const r = parseRef(epic)!;
		const n = ns.find((x) => x.project.param.toLowerCase() === r.repo);
		const decl = n?.visible ? n.state.epics.find((e) => e.id === r.id) : undefined;
		return {
			epic,
			repo: r.repo,
			id: r.id,
			title: decl?.title ?? null,
			href: `/p/${n?.project.param ?? r.repo}/epics#${r.id}`,
			items
		};
	});
	return { epics, elsewhereEpics, addTo };
};
