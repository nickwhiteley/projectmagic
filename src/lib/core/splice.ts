// Edits to `backlog.md` (spec §10.1), as pure functions of the text. Each finds its item by id in
// the text it is given, never in a cache, and changes only that item's range, so a concurrent
// change to another item survives and git can merge an agent's branch around it (spike 0.2).
import { parseBacklog, type Backlog, type Item } from './backlog.ts';
import { formatMeta, LETTER_ID, TASK_ID, type MetaEntry } from './meta.ts';

export type Position =
	| { before: string }
	| { after: string }
	/** First or last in a section, by its index; for an empty section, after its intro. */
	| { section: number; at: 'start' | 'end' };

export interface NewItem {
	id: string;
	title: string;
	star?: boolean;
	/** The heading's ` — WORD` tag. */
	job?: string | null;
	meta: MetaEntry[];
	/** Markdown, without the heading and meta line. */
	body?: string;
}

export interface ItemChange {
	/** A new id, checked against `used` by the caller. */
	id?: string;
	title?: string;
	star?: boolean;
	job?: string | null;
	/** The whole meta line; [] removes it. */
	meta?: MetaEntry[];
	body?: string;
}

export type Op =
	| { op: 'edit'; id: string; change: ItemChange }
	| { op: 'add'; item: NewItem; to: Position }
	| { op: 'move'; id: string; to: Position }
	| { op: 'remove'; id: string };

export class SpliceError extends Error {}

function find(b: Backlog, id: string): Item {
	const it = b.items.find((x) => x.id === id);
	if (!it) throw new SpliceError(`no item ${id}`);
	return it;
}

export function headingLine(p: { id: string; title: string; star?: boolean; job?: string | null }) {
	return `### ${p.id}${p.star ? ' ★' : ''} ${p.title}${p.job ? ` — ${p.job}` : ''}`;
}

/** The item's source, heading to last content line, as an edit's base for the three-way check. */
export function itemSource(text: string, id: string): string | null {
	const it = parseBacklog(text).items.find((x) => x.id === id);
	return it ? text.slice(it.start, it.end) : null;
}

function itemBlock(n: NewItem): string {
	let s = headingLine(n) + '\n';
	if (n.meta.length) s += formatMeta(n.meta) + '\n';
	if (n.body?.trim()) s += '\n' + n.body.trim() + '\n';
	return s;
}

/** Rewrites one item, touching only the parts that changed: heading line, meta line, body. */
function editItem(text: string, it: Item, c: ItemChange): string {
	const src = text.slice(it.start, it.end);
	const headingEnd = src.indexOf('\n') < 0 ? src.length : src.indexOf('\n') + 1;
	let heading = src.slice(0, headingEnd);
	if (c.id !== undefined || c.title !== undefined || c.star !== undefined || c.job !== undefined)
		heading =
			headingLine({
				id: c.id ?? it.id,
				title: c.title ?? it.title,
				star: c.star ?? it.star,
				job: c.job === undefined ? it.headingJob : c.job
			}) + '\n';

	const metaStart = it.metaRange ? it.metaRange.start - it.start : headingEnd;
	const metaEnd = it.metaRange ? it.metaRange.end - it.start : headingEnd;
	let meta = src.slice(metaStart, metaEnd);
	if (c.meta !== undefined) meta = c.meta.length ? formatMeta(c.meta) + '\n' : '';

	let rest = src.slice(metaEnd);
	if (c.body !== undefined) rest = c.body.trim() ? '\n' + c.body.trim() + '\n' : '';
	// The gap between the heading and the meta line, if any, is kept as written.
	const between = src.slice(headingEnd, metaStart);
	return text.slice(0, it.start) + heading + between + meta + rest + text.slice(it.end);
}

/** Where to insert a block: an offset, and whether it goes after the content before it. */
function insertionPoint(
	b: Backlog,
	text: string,
	to: Position,
	exclude?: string
): { at: number; after: boolean } {
	if ('before' in to) return { at: find(b, to.before).start, after: false };
	if ('after' in to) return { at: find(b, to.after).end, after: true };
	const section = b.sections[to.section];
	if (!section) throw new SpliceError(`no section ${to.section}`);
	const items = b.items.filter((i) => i.section === to.section && i.id !== exclude);
	if (items.length)
		return to.at === 'start'
			? { at: items[0].start, after: false }
			: { at: items[items.length - 1].end, after: true };
	// An empty section: after its heading and intro.
	const nl = text.indexOf('\n', section.start);
	let at = nl < 0 ? text.length : nl + 1;
	if (section.intro) at = text.indexOf(section.intro, at) + section.intro.length + 1;
	return { at: Math.min(at, text.length), after: true };
}

/** Items are separated by one blank line, which travels with the item. */
function insert(text: string, point: { at: number; after: boolean }, block: string): string {
	const left = text.slice(0, point.at);
	const right = text.slice(point.at);
	if (point.after) {
		const lead = left.endsWith('\n') ? '\n' : left ? '\n\n' : '';
		return left + lead + block + right;
	}
	return left + block + '\n' + right;
}

/** The range to cut when an item leaves its place: the item and the blank lines after it, or,
 * when nothing follows (the end of the file), the blank lines before it. */
function cutRange(text: string, it: Item): [number, number] {
	let end = it.end;
	while (text[end] === '\n') end++;
	if (end < text.length || end > it.end) return [it.start, end];
	let start = it.start;
	while (start > 1 && text[start - 1] === '\n' && text[start - 2] === '\n') start--;
	return [start, end];
}

/** Applies one edit. `parsed`, if given, must be `parseBacklog(text)`; it saves a parse. */
export function splice(text: string, op: Op, parsed?: Backlog): string {
	const b = parsed ?? parseBacklog(text);
	switch (op.op) {
		case 'edit': {
			const newId = op.change.id;
			if (newId && newId !== op.id && b.items.some((i) => i.id === newId))
				throw new SpliceError(`${newId} is already in use`);
			return editItem(text, find(b, op.id), op.change);
		}
		case 'add': {
			if (b.items.some((i) => i.id === op.item.id))
				throw new SpliceError(`${op.item.id} is already in use`);
			return insert(text, insertionPoint(b, text, op.to), itemBlock(op.item));
		}
		case 'move': {
			const it = find(b, op.id);
			const target = 'before' in op.to ? op.to.before : 'after' in op.to ? op.to.after : null;
			if (target === op.id) return text;
			const [cs, ce] = cutRange(text, it);
			// Find the place in this parse, then shift it across the cut: no second parse.
			const point = insertionPoint(b, text, op.to, op.id);
			if (point.at >= ce) point.at -= ce - cs;
			else if (point.at > cs) point.at = cs;
			const without = text.slice(0, cs) + text.slice(ce);
			return insert(without, point, text.slice(it.start, it.end));
		}
		case 'remove': {
			const [cs, ce] = cutRange(text, find(b, op.id));
			return text.slice(0, cs) + text.slice(ce);
		}
	}
}

/** The commit message (§10.3): `Backlog: edit NW9 DXF export`. */
export function describe(op: Op, b: Backlog): string {
	if (op.op === 'add') return `Backlog: add ${op.item.id} ${op.item.title}`;
	const title = b.items.find((i) => i.id === op.id)?.titleText ?? '';
	return `Backlog: ${op.op} ${op.id}${title ? ` ${title}` : ''}`;
}

/**
 * The id to suggest for a new item (§10.1): the configured prefix, or else the most common letter
 * prefix in use, and one more than the highest number with that prefix. `used` should cover main,
 * every active branch and done history, so a shipped id is never reused.
 */
export function suggestId(prefix: string | null, used: Iterable<string>): string {
	const ids = [...used];
	let p = prefix;
	if (!p) {
		const counts = new Map<string, number>();
		for (const id of ids) {
			const m = id.match(/^([A-Z]{1,4})[0-9]/);
			if (m && LETTER_ID.test(id)) counts.set(m[1], (counts.get(m[1]) ?? 0) + 1);
		}
		p = [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? 'B';
	}
	let max = 0;
	for (const id of ids) {
		const m = id.match(/^([A-Z]{1,4})([0-9]+)[a-z]?$/);
		if (m && m[1] === p) max = Math.max(max, Number(m[2]));
	}
	return `${p}${max + 1}`;
}

/** Why an id can't be used, or null when it can. */
export function checkId(id: string, used: Iterable<string>): string | null {
	if (!LETTER_ID.test(id) && !TASK_ID.test(id))
		return `${id} is not an id: use letters and a number (BP12) or a plan task number (5.8)`;
	for (const u of used) if (u === id) return `${id} is already in use, or was used before`;
	return null;
}
