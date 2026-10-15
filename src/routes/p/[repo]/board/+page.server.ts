import { projectState } from '#lib/server/project-state.ts';
import { assigneesInUse, row } from '#lib/server/item-view.ts';
import type { PageServerLoad } from './$types';

const COLUMNS = ['todo', 'in progress', 'blocked', 'in review', 'built', 'done'] as const;

export const load: PageServerLoad = async ({ locals, params }) => {
	const s = await projectState({ locals, params });
	const rows = s.items.map((i) => row(s, i));
	const lane = (section: number | null, title: string) => ({
		title,
		section,
		cells: COLUMNS.map((c) => rows.filter((r) => r.section === section && r.status === c))
	});
	const lanes = [
		...(rows.some((r) => r.section === null) ? [lane(null, 'Before the first section')] : []),
		...s.sections.map((sec) => lane(sec.index, sec.titleText))
	].filter((l) => l.cells.some((c) => c.length));
	// Shipped in the last 30 days (§9): removed from the backlog, so they have no section.
	const recent = s.done.filter(
		(d) => !d.unpruned && d.at && Date.now() - Date.parse(d.at) < 30 * 86_400_000
	);
	return {
		columns: COLUMNS,
		assignees: assigneesInUse(s),
		lanes,
		shipped: recent.map((d) => ({ id: d.id, title: d.title, at: d.at }))
	};
};
