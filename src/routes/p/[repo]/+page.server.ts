import { projectState } from '#lib/server/project-state.ts';
import { assigneesInUse, row } from '#lib/server/item-view.ts';
import { md } from '#lib/server/views.ts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, params }) => {
	const s = await projectState({ locals, params });
	// Items and notes in file order, under their sections: order is priority (§5.1).
	type Entry =
		| { kind: 'item'; start: number; item: ReturnType<typeof row> }
		| { kind: 'note'; start: number; title: string; html: string };
	const entries = (section: number | null): Entry[] =>
		[
			...s.items
				.filter((i) => i.section === section)
				.map((i) => ({ kind: 'item' as const, start: i.start, item: row(s, i, true) })),
			...s.notes
				.filter((n) => n.section === section)
				.map((n) => ({
					kind: 'note' as const,
					start: n.start,
					title: n.titleText,
					html: md(s, n.body)
				}))
		].sort((a, b) => a.start - b.start);
	const h = s.health;
	return {
		preambleHtml: s.preambleText.trim() ? md(s, s.preambleText) : null,
		top: entries(null),
		sections: s.sections.map((sec) => ({
			title: sec.titleText,
			introHtml: sec.intro ? md(s, sec.intro) : null,
			entries: entries(sec.index)
		})),
		assignees: assigneesInUse(s),
		jobs: [...new Set(s.items.map((i) => i.job).filter((j): j is string => !!j))].sort(),
		health: {
			warnings: h.warnings.map((w) => ({ line: w.line, message: w.message })),
			disagreements: h.disagreements,
			dangling: h.dangling.map((d) => `${d.ref} (from ${d.where})`),
			unknownTasks: h.unknownTasks,
			configWarnings: h.configWarnings,
			assignees: h.assignees,
			notes: h.notes
		}
	};
};
