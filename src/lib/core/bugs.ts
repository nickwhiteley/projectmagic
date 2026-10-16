// Bugs in their own file (PM29, spec §13): an optional second backlog, `bugs.md`, parsed like the
// main one. The views read one list, so its items are merged in after the main backlog's, in one
// section called Bugs, each marked with the file it lives in so an edit goes back to that file.
import type { Backlog, Item, Section, Warning } from './backlog.ts';

/** A parse as the sync caches it: each item carries its source. */
export interface StoredFile extends Omit<Backlog, 'items'> {
	items: (Item & { source: string })[];
	preambleText?: string;
}

export const BUGS_SECTION = 'Bugs';

export const emptyBacklog = (): StoredFile => ({
	preamble: { start: 0, end: 0 },
	sections: [],
	items: [],
	notes: [],
	warnings: [],
	preambleText: ''
});

/**
 * The main backlog with the bugs file's items after it. Ids already in the main backlog are kept
 * once and flagged, so one id never names two items.
 */
export function mergeBugs(main: StoredFile | null, bugs: StoredFile, path: string): StoredFile {
	const base = main ?? emptyBacklog();
	const taken = new Set(base.items.map((i) => i.id));
	const warnings: Warning[] = [...base.warnings];
	for (const w of bugs.warnings) warnings.push({ ...w, message: `${path}: ${w.message}` });
	const index = base.sections.length;
	const section: Section = {
		index,
		title: BUGS_SECTION,
		titleText: BUGS_SECTION,
		intro: '',
		start: 0,
		end: 0,
		line: 0,
		file: path
	};
	const items = bugs.items.flatMap((it) => {
		if (taken.has(it.id)) {
			warnings.push({
				kind: 'duplicate-id',
				line: it.line,
				id: it.id,
				message: `${path}: ${it.id} is also in the main backlog, so only that one is shown`
			});
			return [];
		}
		taken.add(it.id);
		return [{ ...it, section: index, file: path }];
	});
	return {
		...base,
		sections: [...base.sections, section],
		items: [...base.items, ...items],
		warnings
	};
}

/**
 * Where "first" or "last in Bugs" is in `bugs.md`: next to its first or last item, other than the
 * one being moved. The merged Bugs section has no place of its own in the file. Null when there is
 * no other bug, and the caller falls back to the file's first section.
 */
export function bugsPosition(
	items: { id: string; file: string | null }[],
	at: 'start' | 'end',
	exclude?: string
): { before: string } | { after: string } | null {
	const bugs = items.filter((i) => i.file && i.id !== exclude);
	if (!bugs.length) return null;
	return at === 'start' ? { before: bugs[0].id } : { after: bugs[bugs.length - 1].id };
}
