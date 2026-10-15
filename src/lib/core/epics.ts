// Epics (PM1, spec §13): an item names its epic with `Epic: EP3`, and the epic is declared by an
// item or a section whose id is `EP` and a number. The roll-up counts each epic's items by
// status, shipped ones included.
import type { Status } from './meta.ts';

const EPIC_ID = /^EP\d+$/;

/** An item's `Epic:` value as an epic id: the first word, without markdown, in upper case. */
export function epicId(raw: string | null | undefined): string | null {
	const word = (raw ?? '').replace(/[`*_]/g, '').trim().split(/\s+/)[0]?.toUpperCase();
	return word && EPIC_ID.test(word) ? word : null;
}

/** An epic's declaration: an item `### EP3 Title` or a section `## EP3 Title`. */
export function declaredEpic(id: string): string | null {
	return EPIC_ID.test(id.toUpperCase()) ? id.toUpperCase() : null;
}

export interface EpicRollup {
	id: string;
	/** From its declaration; null when items name an epic nobody declared. */
	title: string | null;
	declared: boolean;
	/** Items on main plus shipped ones, by status. */
	counts: Partial<Record<Status, number>>;
	total: number;
	/** Items still on main, in the backlog's order. */
	items: string[];
	/** Items that shipped: removed from the backlog. */
	shipped: string[];
}

export interface EpicChild {
	id: string;
	epic: string | null;
	status: Status;
}

export function rollUp(
	declarations: { id: string; title: string }[],
	children: EpicChild[],
	shipped: { id: string; epic: string | null }[]
): EpicRollup[] {
	const byId = new Map<string, EpicRollup>();
	const get = (id: string): EpicRollup => {
		let e = byId.get(id);
		if (!e) {
			e = { id, title: null, declared: false, counts: {}, total: 0, items: [], shipped: [] };
			byId.set(id, e);
		}
		return e;
	};
	for (const d of declarations) {
		const e = get(d.id);
		if (!e.declared) Object.assign(e, { title: d.title, declared: true });
	}
	for (const c of children) {
		if (!c.epic) continue;
		const e = get(c.epic);
		e.counts[c.status] = (e.counts[c.status] ?? 0) + 1;
		e.total++;
		e.items.push(c.id);
	}
	for (const s of shipped) {
		if (!s.epic) continue;
		const e = get(s.epic);
		e.counts.done = (e.counts.done ?? 0) + 1;
		e.total++;
		e.shipped.push(s.id);
	}
	const num = (id: string) => Number(id.slice(2));
	return [...byId.values()].sort(
		(a, b) => Number(b.declared) - Number(a.declared) || num(a.id) - num(b.id)
	);
}
