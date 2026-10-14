// `backlog.md` (spec §5.1): a preamble, `##` sections, and `###` headings that are items when
// their first token is an id and notes otherwise. Every part keeps its exact source range, so
// splice.ts can rewrite one item and leave every other byte alone.
import type { Heading, RootContent } from 'mdast';
import { endOf, lineIndex, parseMarkdown, plain, startOf } from './markdown.ts';
import { idKind, parseMeta, type IdKind, type Meta } from './meta.ts';

export interface Range {
	start: number;
	end: number;
}

export interface Section extends Range {
	index: number;
	/** The heading's text as markdown, and without markup. */
	title: string;
	titleText: string;
	/** What sits between the heading and its first `###`, usually an italic line. Markdown. */
	intro: string;
	line: number;
}

interface Entry extends Range {
	title: string;
	titleText: string;
	/** Index into `sections`, or null in the preamble. */
	section: number | null;
	line: number;
	/** The markdown after the heading (and after the meta line, for an item), trimmed. */
	body: string;
}

export type Note = Entry;

export interface Item extends Entry {
	id: string;
	idKind: IdKind;
	/** On the cut line: a `★` in the heading. */
	star: boolean;
	/** The heading's trailing ` — WORD`. */
	headingJob: string | null;
	/** `Job:` in the meta line, else the heading's tag. */
	job: string | null;
	meta: Meta | null;
	/** The meta line's range, including its newline. */
	metaRange: Range | null;
}

export type WarningKind = 'no-meta' | 'bad-status' | 'duplicate-id' | 'bad-id' | 'compound-heading';

export interface Warning {
	kind: WarningKind;
	line: number;
	id?: string;
	message: string;
}

export interface Backlog {
	/** Everything before the first `##`, notes included. */
	preamble: Range;
	sections: Section[];
	items: Item[];
	notes: Note[];
	warnings: Warning[];
}

// Looks like an attempt at an id but isn't one: `nw9`, `NW9:`, `A1B`.
const NEAR_ID = /^[A-Za-z]{1,4}[0-9]+[A-Za-z]?[:.,]?$/;

interface HeadingParts {
	id: string | null;
	rest: string;
	star: boolean;
	job: string | null;
}

/** "A1a ★ The whole of billing — MONEY" → id A1a, star, title, job MONEY. */
function splitHeading(raw: string): HeadingParts {
	const star = raw.includes('★');
	const t = raw.replace('★', ' ').trim();
	const m = t.match(/^(\S+)\s*(.*)$/s);
	const first = m?.[1] ?? '';
	const id = idKind(first) ? first : null;
	let rest = id ? (m?.[2] ?? '') : t;
	let job: string | null = null;
	const j = rest.match(/\s+—\s+([A-Z]+)$/);
	if (j) {
		job = j[1];
		rest = rest.slice(0, j.index);
	}
	return { id, rest: rest.trim(), star, job };
}

/** The end of a run of blocks: its last content node and the newline after it. A trailing `---`
 * and blank lines belong to the gap between entries, not to the entry (spike 0.2). */
function blockEnd(nodes: RootContent[], text: string): number {
	const content = nodes.filter((n) => n.type !== 'thematicBreak');
	let end = endOf(content[content.length - 1]);
	if (text[end] === '\n') end++;
	return end;
}

function headingSource(h: Heading, text: string): string {
	if (!h.children.length) return '';
	return text.slice(startOf(h.children[0]), endOf(h.children[h.children.length - 1]));
}

export function parseBacklog(text: string): Backlog {
	const nodes = parseMarkdown(text).children;
	const line = lineIndex(text);
	const sections: Section[] = [];
	const items: Item[] = [];
	const notes: Note[] = [];
	const warnings: Warning[] = [];

	for (let i = 0; i < nodes.length; i++) {
		const n = nodes[i];
		if (n.type !== 'heading' || n.depth > 3) continue;
		const body: RootContent[] = [];
		for (let k = i + 1; k < nodes.length; k++) {
			const m = nodes[k];
			if (m.type === 'heading' && m.depth <= 3) break;
			body.push(m);
		}
		const start = startOf(n);
		const raw = headingSource(n, text);
		const headingEnd = Math.min(text.length, endOf(n) + (text[endOf(n)] === '\n' ? 1 : 0));

		if (n.depth === 2) {
			const introEnd = body.length ? blockEnd(body, text) : headingEnd;
			sections.push({
				index: sections.length,
				title: raw,
				titleText: plain(n),
				intro: text.slice(headingEnd, introEnd).trim(),
				start,
				end: start, // set when the next section starts
				line: line(start)
			});
			continue;
		}
		if (n.depth === 1) continue;

		const end = blockEnd([n, ...body], text);
		const section = sections.length ? sections.length - 1 : null;
		const parts = splitHeading(raw);
		const text_ = splitHeading(plain(n));

		if (!parts.id) {
			const first = parts.rest.split(/\s+/)[0] ?? '';
			if (NEAR_ID.test(first))
				warnings.push({
					kind: 'bad-id',
					line: line(start),
					message: `"${first}" is not an id; the heading is read as a note`
				});
			notes.push({
				title: parts.rest,
				titleText: text_.rest,
				section,
				start,
				end,
				line: line(start),
				body: text.slice(headingEnd, end).trim()
			});
			continue;
		}

		let meta: Meta | null = null;
		let metaRange: Range | null = null;
		const first = body[0];
		if (first?.type === 'paragraph') {
			const ps = startOf(first);
			const nl = text.indexOf('\n', ps);
			const lineEnd = nl < 0 || nl > endOf(first) ? endOf(first) : nl;
			meta = parseMeta(text.slice(ps, lineEnd));
			if (meta) metaRange = { start: ps, end: Math.min(lineEnd + 1, text.length) };
		}
		const id = parts.id;
		const item: Item = {
			id,
			idKind: idKind(id)!,
			title: parts.rest,
			titleText: text_.rest,
			star: parts.star,
			headingJob: parts.job,
			job: meta?.job ?? parts.job,
			section,
			start,
			end,
			line: line(start),
			meta,
			metaRange,
			body: text.slice(metaRange?.end ?? headingEnd, end).trim()
		};
		items.push(item);

		if (/^\+\s+\S/.test(parts.rest))
			warnings.push({
				kind: 'compound-heading',
				line: item.line,
				id,
				message: `"${raw}" carries more than one id; only ${id} is read`
			});
		if (!meta)
			warnings.push({ kind: 'no-meta', line: item.line, id, message: `${id} has no meta line` });
		else if (!meta.status)
			warnings.push({
				kind: 'bad-status',
				line: item.line,
				id,
				message: `${id}: "${meta.statusRaw}" is not a status`
			});
	}

	for (let s = 0; s < sections.length; s++)
		sections[s].end = s + 1 < sections.length ? sections[s + 1].start : text.length;

	const seen = new Set<string>();
	for (const it of items) {
		if (seen.has(it.id))
			warnings.push({
				kind: 'duplicate-id',
				line: it.line,
				id: it.id,
				message: `${it.id} appears more than once`
			});
		seen.add(it.id);
	}
	warnings.sort((a, b) => a.line - b.line);

	return {
		preamble: { start: 0, end: sections[0]?.start ?? text.length },
		sections,
		items,
		notes,
		warnings
	};
}
