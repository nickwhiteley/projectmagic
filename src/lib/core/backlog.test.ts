import { describe, expect, it } from 'vitest';
import { parseBacklog, type Backlog } from './backlog';
import { fixture } from './fixtures';

const SAMPLE = `# Backlog

Preamble prose.

### Start here, 1 October 2026

A note before the first section.

## Now — days

*What is next.*

### NW9 DXF export — PRO
**Status:** in progress · **Size:** M · **Branch:** \`feat/nw9-dxf-export\`

The body, with **bold**.

#### A sub-heading inside the body

More body.

---

### A1a ★ The whole of billing — MONEY
**Specced:** \`specs/billing.md\`

No meta line here.

## Later

### 5.8 New sketch piece, and *Make sketch* — DESIGN
**Status:** built* · **Job:** CLIENT

### E5 + E6 residual
**Status:** sometime

### nw10 lower case

### NW9 Again
**Status:** todo
`;

describe('parseBacklog on a sample', () => {
	const b = parseBacklog(SAMPLE);
	const item = (id: string) => b.items.find((i) => i.id === id)!;

	it('finds sections, the preamble and notes', () => {
		expect(b.sections.map((s) => s.titleText)).toEqual(['Now — days', 'Later']);
		expect(b.sections[0].intro).toBe('*What is next.*');
		expect(SAMPLE.slice(b.preamble.start, b.preamble.end)).toMatch(
			/^# Backlog[\s\S]*A note before/
		);
		expect(b.notes.map((n) => [n.titleText, n.section])).toEqual([
			['Start here, 1 October 2026', null],
			['nw10 lower case', 1]
		]);
	});

	it('reads ids, titles, stars and job tags', () => {
		expect(b.items.map((i) => [i.id, i.idKind, i.section])).toEqual([
			['NW9', 'letter', 0],
			['A1a', 'letter', 0],
			['5.8', 'task', 1],
			['E5', 'letter', 1],
			['NW9', 'letter', 1]
		]);
		expect(item('A1a')).toMatchObject({ star: true, title: 'The whole of billing', job: 'MONEY' });
		expect(item('5.8')).toMatchObject({
			title: 'New sketch piece, and *Make sketch*',
			titleText: 'New sketch piece, and Make sketch',
			headingJob: 'DESIGN',
			job: 'CLIENT'
		});
	});

	it('reads the meta line and leaves prose alone', () => {
		expect(item('NW9').meta).toMatchObject({ status: 'in progress', size: 'M' });
		expect(item('NW9').meta!.branches).toEqual(['feat/nw9-dxf-export']);
		expect(item('A1a').meta).toBeNull();
		expect(item('A1a').body).toMatch(/^\*\*Specced:\*\*/);
		expect(item('5.8').meta!.status).toBe('built');
	});

	it('gives each item an exact range, without the trailing rule and blank lines', () => {
		const nw9 = item('NW9');
		const src = SAMPLE.slice(nw9.start, nw9.end);
		expect(src.startsWith('### NW9 DXF export')).toBe(true);
		expect(src.endsWith('More body.\n')).toBe(true);
		expect(SAMPLE.slice(nw9.metaRange!.start, nw9.metaRange!.end)).toMatch(/^\*\*Status:\*\*.*\n$/);
		expect(nw9.body).toBe(
			'The body, with **bold**.\n\n#### A sub-heading inside the body\n\nMore body.'
		);
	});

	it('warns', () => {
		expect(b.warnings.map((w) => [w.kind, w.id ?? null])).toEqual([
			['no-meta', 'A1a'],
			['compound-heading', 'E5'],
			['bad-status', 'E5'],
			['bad-id', null],
			['duplicate-id', 'NW9']
		]);
	});

	it('copes with an empty file and a file with no sections', () => {
		expect(parseBacklog('')).toMatchObject({
			items: [],
			sections: [],
			preamble: { start: 0, end: 0 }
		});
		const b2 = parseBacklog('### X1 Only\n**Status:** done');
		expect(b2.items[0]).toMatchObject({ id: 'X1', section: null, end: 28 });
		expect(b2.items[0].meta!.status).toBe('done');
	});
});

// The golden summary of a real file: what the views will show. Changing the parser changes these
// files, and the diff is the review.
function summary(b: Backlog) {
	return {
		sections: b.sections.map((s) => ({ title: s.titleText, line: s.line })),
		notes: b.notes.map((n) => ({ title: n.titleText, line: n.line })),
		items: b.items.map((i) => ({
			id: i.id,
			line: i.line,
			title: i.title,
			star: i.star || undefined,
			job: i.job ?? undefined,
			section: i.section,
			meta: i.meta ? Object.fromEntries(i.meta.entries.map((e) => [e.key, e.value])) : null
		})),
		warnings: b.warnings
	};
}

describe.each(['orchard', 'lantern'] as const)('the %s backlog', (repo) => {
	const text = fixture(repo, 'backlog.md');
	const b = parseBacklog(text);

	it('matches its golden summary', async () => {
		await expect(JSON.stringify(summary(b), null, '\t') + '\n').toMatchFileSnapshot(
			`../../../test/golden/${repo}-backlog.json`
		);
	});

	it('has a meta line on every item and no warnings', () => {
		expect(b.warnings).toEqual([]);
		expect(b.items.every((i) => i.meta?.status)).toBe(true);
	});

	it('has ordered, disjoint ranges that start at their headings', () => {
		const all = [...b.items, ...b.notes].sort((x, y) => x.start - y.start);
		for (let i = 1; i < all.length; i++) expect(all[i - 1].end).toBeLessThanOrEqual(all[i].start);
		for (const it of b.items) expect(text.slice(it.start, it.start + 4)).toBe('### ');
	});
});

describe('the fixtures in particular', () => {
	it('orchard', () => {
		const b = parseBacklog(fixture('orchard', 'backlog.md'));
		const nw9 = b.items.find((i) => i.id === 'NW9')!;
		expect(b.items).toHaveLength(55);
		expect(nw9).toMatchObject({ title: 'DXF export', job: 'PRO' });
		expect(nw9.meta).toMatchObject({ status: 'built', plan: ['46'] });
		expect(b.items.find((i) => i.id === 'A1b')!.meta!.status).toBe('blocked');
		expect(b.notes.map((n) => n.titleText)).toEqual(['Start here, 1 October 2026']);
	});

	it('lantern', () => {
		const b = parseBacklog(fixture('lantern', 'backlog.md'));
		expect(b.items).toHaveLength(24);
		expect(b.items.filter((i) => i.idKind === 'task')).toHaveLength(15);
		const snug = b.items.find((i) => i.id === '9.1')!;
		expect(snug).toMatchObject({ star: true, job: 'TRUST' });
		expect(snug.meta!.status).toBe('blocked');
		expect(b.items.find((i) => i.id === '5.8')!.meta!.branches).toEqual(['feat/sketch-editor']);
	});
});
