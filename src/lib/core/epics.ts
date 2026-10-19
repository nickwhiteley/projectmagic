// Epics (PM1, spec §13): an item names its epic with `Epic: EP3`, and the epic is declared by an
// item or a section whose id is `EP` and a number. The roll-up counts each epic's items by
// status, shipped ones included.
import { parseBacklog } from './backlog.ts';
import type { Status } from './meta.ts';
import { isHere, parseRef, refString } from './crossref.ts';

const EPIC_ID = /^EP\d+$/;

/**
 * An item's `Epic:` value as an epic: the first word, without markdown, in upper case (`EP3`), or
 * another repository's epic as `<repo>:EP3` (PM36), its repo in lower case. An epic of `here`,
 * written with its own repo, is the bare id.
 */
export function epicId(
	raw: string | null | undefined,
	here?: { owner: string; repo: string }
): string | null {
	const word = ((raw ?? '').replace(/[`*]/g, '').trim().split(/\s+/)[0] ?? '').replace(
		/^_+|_+$/g,
		''
	);
	const ref = parseRef(word);
	if (ref) {
		if (!EPIC_ID.test(ref.id)) return null;
		return here && isHere(ref.repo, here) ? ref.id : refString(ref);
	}
	const id = word.toUpperCase();
	return id && EPIC_ID.test(id) ? id : null;
}

/** Whether an epic id is another repository's (`bloomprint:EP3`). */
export const isCrossEpic = (epic: string | null | undefined): boolean => !!epic?.includes(':');

/** An epic's declaration: an item `### EP3 Title` or a section `## EP3 Title`. */
export function declaredEpic(id: string): string | null {
	return EPIC_ID.test(id.toUpperCase()) ? id.toUpperCase() : null;
}

export interface EpicRollup {
	id: string;
	/** From its declaration; null when items name an epic nobody declared. */
	title: string | null;
	/** From `epics.md` (PM28), in markdown; '' when it has none. */
	description: string;
	target: string | null;
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
	declarations: { id: string; title: string; description?: string; target?: string | null }[],
	children: EpicChild[],
	shipped: { id: string; epic: string | null }[]
): EpicRollup[] {
	const byId = new Map<string, EpicRollup>();
	const get = (id: string): EpicRollup => {
		let e = byId.get(id);
		if (!e) {
			e = {
				id,
				title: null,
				description: '',
				target: null,
				declared: false,
				counts: {},
				total: 0,
				items: [],
				shipped: []
			};
			byId.set(id, e);
		}
		return e;
	};
	for (const d of declarations) {
		const e = get(d.id);
		if (!e.declared) Object.assign(e, { title: d.title, declared: true });
		// The first declaration to say something about it wins, so epics.md can add to a heading.
		if (d.description && !e.description) e.description = d.description;
		if (d.target && !e.target) e.target = d.target;
	}
	// An item in another repository's epic (PM36) is counted there, not here.
	for (const c of children) {
		if (!c.epic || isCrossEpic(c.epic)) continue;
		const e = get(c.epic);
		e.counts[c.status] = (e.counts[c.status] ?? 0) + 1;
		e.total++;
		e.items.push(c.id);
	}
	for (const s of shipped) {
		if (!s.epic || isCrossEpic(s.epic)) continue;
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

/** An epic declared in `epics.md` (PM28): its title, a description in markdown and a target. */
export interface EpicDeclaration {
	id: string;
	title: string;
	description: string;
	/** `**Target:** 2026-12-01` (any text), or null. */
	target: string | null;
}

const TARGET = /^\*\*Target:\*\*[ \t]*(.+)$/im;

/**
 * Reads `epics.md`: each `### EP3 Title` (or `## EP3 Title`) heading declares an epic, the text
 * under it is the description, and a `**Target:** …` line in it, or in a meta line, is the target.
 */
export function parseEpicsFile(text: string): EpicDeclaration[] {
	const b = parseBacklog(text);
	const out: EpicDeclaration[] = [];
	const seen = new Set<string>();
	const add = (id: string | null, title: string, body: string, metaTarget?: string) => {
		if (!id || seen.has(id)) return;
		seen.add(id);
		const m = body.match(TARGET);
		out.push({
			id,
			title,
			description: body
				.replace(TARGET, '')
				.replace(/\n{3,}/g, '\n\n')
				.trim(),
			target: (metaTarget ?? m?.[1] ?? '').trim() || null
		});
	};
	for (const sec of b.sections) {
		const id = declaredEpic(sec.titleText.split(/\s+/)[0] ?? '');
		if (id) add(id, sec.titleText.slice(id.length).trim(), sec.intro);
	}
	for (const it of b.items) {
		const id = declaredEpic(it.id);
		const meta = it.meta?.entries.find((e) => e.key.toLowerCase() === 'target')?.value;
		add(id, it.titleText, it.body, meta);
	}
	return out;
}

const EPIC_NAME_MAX = 80;

/** What an Epic field means (PM1): an id, the name of an epic that exists, or a new epic's name. */
export type EpicChoice =
	| { kind: 'none' }
	| { kind: 'id'; id: string }
	| { kind: 'new'; id: string; title: string }
	| { kind: 'bad'; message: string };

/**
 * Reads what a person typed in the Epic field. `EP3` names that epic, as before, and
 * `<repo>:EP3` another repository's (PM36). Anything else is
 * a name: if an epic already has that title (ignoring case) it is that epic, and otherwise it is a
 * new epic, numbered after the highest in use.
 */
export function chooseEpic(raw: string, known: { id: string; title: string | null }[]): EpicChoice {
	const typed = raw.replace(/\s+/g, ' ').trim();
	if (!typed) return { kind: 'none' };
	if (EPIC_ID.test(typed.toUpperCase())) return { kind: 'id', id: typed.toUpperCase() };
	// Another repository's epic (PM36): `person-service:EP1`.
	const ref = parseRef(typed);
	if (ref && EPIC_ID.test(ref.id)) return { kind: 'id', id: refString(ref) };
	if (typed.length > EPIC_NAME_MAX)
		return { kind: 'bad', message: `An epic's name is at most ${EPIC_NAME_MAX} characters.` };
	if (/^#|[`\n]/.test(typed))
		return { kind: 'bad', message: 'An epic is an id such as EP3, or a name in plain text.' };
	const hit = known.find((e) => e.title?.trim().toLowerCase() === typed.toLowerCase());
	if (hit) return { kind: 'id', id: hit.id };
	const highest = Math.max(0, ...known.map((e) => Number(e.id.slice(2)) || 0));
	return { kind: 'new', id: `EP${highest + 1}`, title: typed };
}

/** `epics.md` with a new epic declared at its end. */
export function declareEpic(text: string, id: string, title: string): string {
	const body = text.trimEnd();
	return `${body ? `${body}\n\n` : '# Epics\n\n'}### ${id} ${title}\n`;
}

/**
 * An epic's status, worked out from its items' (PM36), shipped ones as done: all done is done, any
 * blocked is blocked, any started (in progress, in review, built, or some done) is in progress, all
 * built or done is built, and otherwise todo. Null with no items.
 */
export function epicStatus(statuses: Status[]): Status | null {
	if (!statuses.length) return null;
	if (statuses.every((s) => s === 'done')) return 'done';
	if (statuses.includes('blocked')) return 'blocked';
	if (statuses.every((s) => s === 'built' || s === 'done')) return 'built';
	if (statuses.some((s) => s !== 'todo')) return 'in progress';
	return 'todo';
}
