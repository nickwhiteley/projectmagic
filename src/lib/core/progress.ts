// `PROGRESS.md` (spec §5.2): a plan table is a GFM table whose first header is `#` and that has
// a `Status` column. Each row is a task; its group is the nearest heading above the table. The
// rest of the file is rendered as a document, not parsed.
import type { Table } from 'mdast';
import { endOf, lineIndex, parseMarkdown, plain, startOf } from './markdown';

export const PLAN_STATUSES = [
	'todo',
	'in progress',
	'blocked',
	'built',
	'done',
	'skipped'
] as const;
export type PlanStatus = (typeof PLAN_STATUSES)[number] | 'unknown';

export interface Cell {
	header: string;
	/** The cell as markdown. */
	value: string;
}

export interface Task {
	number: string;
	/** The heading above the table, without markup, or null before any heading. */
	group: string | null;
	/** The second column, as markdown. */
	title: string;
	status: PlanStatus;
	/** What follows the canonical word: "passed on 18.6 …". Markdown. */
	note: string;
	/** The whole status cell, as markdown. */
	statusRaw: string;
	/** Every column, in order. */
	cells: Cell[];
	line: number;
	/** A later table has a row with the same number, so this one is history and isn't linked. */
	superseded: boolean;
}

export interface Group {
	title: string | null;
	line: number;
	total: number;
	done: number;
	counts: Partial<Record<PlanStatus, number>>;
}

export interface Plan {
	/** Every row of every plan table, in document order, superseded ones included. */
	tasks: Task[];
	/** The current task for each number: the last table's. */
	byNumber: Map<string, Task>;
	groups: Group[];
	/** The first current task that is in progress or todo; built tasks wait on a person, not an agent. */
	next: Task | null;
	/** Current tasks whose status cell doesn't start with a canonical word. */
	unknown: Task[];
}

// The canonical word, with Orchard's `built*` (maybe escaped), not followed by more letters.
const WORD = /^(done|todo|in progress|blocked|built|skipped)(\\?\*)?(?![A-Za-z])/i;

/** `**done**: passed on 18.6`, `done`, `built*`, `**done** except …` → the status and the note. */
export function parseStatusCell(raw: string): { status: PlanStatus; note: string } {
	// A bold opening is unwrapped first, so the word must lead the bold span.
	const bold = raw.match(/^\*\*(.+?)\*\*/s);
	const lead = bold ? bold[1] : raw;
	const m = lead.match(WORD);
	if (!m) return { status: 'unknown', note: raw };
	const rest = bold ? lead.slice(m[0].length) + raw.slice(bold[0].length) : raw.slice(m[0].length);
	return {
		status: m[1].toLowerCase().replace(/\s+/g, ' ') as PlanStatus,
		note: rest.replace(/^[\s:,.;–—-]+/, '').trim()
	};
}

function cellSource(cell: Table['children'][number]['children'][number], text: string): string {
	if (!cell.children.length) return '';
	return text.slice(startOf(cell.children[0]), endOf(cell.children[cell.children.length - 1]));
}

export function parseProgress(text: string): Plan {
	const nodes = parseMarkdown(text).children;
	const line = lineIndex(text);
	const tasks: Task[] = [];
	let group: string | null = null;

	for (const n of nodes) {
		if (n.type === 'heading') group = plain(n).trim();
		if (n.type !== 'table') continue;
		const [head, ...rows] = n.children;
		const headers = head.children.map((c) => plain(c).trim());
		const si = headers.findIndex((h) => h.toLowerCase() === 'status');
		if (headers[0] !== '#' || si < 0) continue;
		for (const row of rows) {
			const cells = row.children.map((c, i) => ({
				header: headers[i] ?? '',
				value: cellSource(c, text).trim()
			}));
			const number = plain(row.children[0]).trim();
			if (!number) continue;
			const statusRaw = cells[si]?.value ?? '';
			tasks.push({
				number,
				group,
				title: cells[1]?.value ?? '',
				...parseStatusCell(statusRaw),
				statusRaw,
				cells,
				line: line(startOf(row)),
				superseded: false
			});
		}
	}

	// When a number repeats across tables, the later one wins (spec §5.2).
	const byNumber = new Map<string, Task>();
	for (const t of tasks) {
		const earlier = byNumber.get(t.number);
		if (earlier) earlier.superseded = true;
		byNumber.set(t.number, t);
	}
	const current = tasks.filter((t) => !t.superseded);

	const groups: Group[] = [];
	for (const t of current) {
		let g = groups.find((x) => x.title === t.group);
		if (!g) groups.push((g = { title: t.group, line: t.line, total: 0, done: 0, counts: {} }));
		g.total++;
		if (t.status === 'done') g.done++;
		g.counts[t.status] = (g.counts[t.status] ?? 0) + 1;
	}

	return {
		tasks,
		byNumber,
		groups,
		next: current.find((t) => t.status === 'in progress' || t.status === 'todo') ?? null,
		unknown: current.filter((t) => t.status === 'unknown')
	};
}
