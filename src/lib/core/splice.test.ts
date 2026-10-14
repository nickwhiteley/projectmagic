import { describe as group, expect, it } from 'vitest';
import { parseBacklog } from './backlog.ts';
import { fixture } from './fixtures.ts';
import { parseMeta } from './meta.ts';
import { checkId, describe, splice, SpliceError, suggestId, type Op } from './splice.ts';

const SAMPLE = `# Backlog

## Now

*Intro.*

### NW9 DXF export — PRO
**Status:** built · **Size:** M

The body.

### A1a ★ Billing — MONEY
**Specced:** prose, not meta.

---

## Empty

*Nothing here yet.*

## Later

### BP3 Filtering
**Status:** todo
`;

const ids = (t: string) => parseBacklog(t).items.map((i) => i.id);
const meta = (line: string) => parseMeta(line)!.entries;

group('splice: edit', () => {
	it('changes only the meta line when only the meta changes', () => {
		const out = splice(SAMPLE, {
			op: 'edit',
			id: 'NW9',
			change: { meta: meta('**Status:** done · **Size:** M') }
		});
		expect(out).toBe(SAMPLE.replace('**Status:** built', '**Status:** done'));
	});

	it('adds a meta line to an item without one, keeping the prose', () => {
		const out = splice(SAMPLE, {
			op: 'edit',
			id: 'A1a',
			change: { meta: meta('**Status:** todo') }
		});
		expect(out).toContain(
			'### A1a ★ Billing — MONEY\n**Status:** todo\n**Specced:** prose, not meta.\n'
		);
	});

	it('rebuilds the heading when the title, star, job or id change', () => {
		const out = splice(SAMPLE, {
			op: 'edit',
			id: 'A1a',
			change: { id: 'A1c', title: 'Billing, again', star: false, job: null }
		});
		expect(out).toContain('### A1c Billing, again\n**Specced:**');
		expect(() => splice(SAMPLE, { op: 'edit', id: 'A1a', change: { id: 'NW9' } })).toThrow(
			SpliceError
		);
	});

	it('replaces the body', () => {
		const out = splice(SAMPLE, {
			op: 'edit',
			id: 'NW9',
			change: { body: 'New body.\n\n- a list' }
		});
		expect(out).toContain('**Status:** built · **Size:** M\n\nNew body.\n\n- a list\n\n### A1a');
	});

	it('removes the meta line and the body', () => {
		const out = splice(SAMPLE, { op: 'edit', id: 'NW9', change: { meta: [], body: '' } });
		expect(out).toContain('### NW9 DXF export — PRO\n\n### A1a');
	});
});

group('splice: add, move, remove', () => {
	const item = { id: 'BP12', title: 'A new thing', meta: meta('**Status:** todo · **Size:** S') };

	it('adds before, after, and at either end of a section', () => {
		expect(ids(splice(SAMPLE, { op: 'add', item, to: { before: 'NW9' } }))).toEqual([
			'BP12',
			'NW9',
			'A1a',
			'BP3'
		]);
		expect(ids(splice(SAMPLE, { op: 'add', item, to: { after: 'NW9' } }))).toEqual([
			'NW9',
			'BP12',
			'A1a',
			'BP3'
		]);
		expect(ids(splice(SAMPLE, { op: 'add', item, to: { section: 0, at: 'end' } }))).toEqual([
			'NW9',
			'A1a',
			'BP12',
			'BP3'
		]);
		const out = splice(SAMPLE, { op: 'add', item, to: { section: 2, at: 'end' } });
		expect(out).toContain(
			'### BP3 Filtering\n**Status:** todo\n\n### BP12 A new thing\n**Status:** todo · **Size:** S\n'
		);
	});

	it('adds into an empty section after its intro', () => {
		const out = splice(SAMPLE, {
			op: 'add',
			item: { ...item, body: 'Why.' },
			to: { section: 1, at: 'start' }
		});
		expect(out).toContain(
			'## Empty\n\n*Nothing here yet.*\n\n### BP12 A new thing\n**Status:** todo · **Size:** S\n\nWhy.\n\n## Later'
		);
		expect(parseBacklog(out).items.find((i) => i.id === 'BP12')!.section).toBe(1);
	});

	it('refuses an id in use', () => {
		expect(() =>
			splice(SAMPLE, { op: 'add', item: { ...item, id: 'BP3' }, to: { before: 'NW9' } })
		).toThrow(/already in use/);
	});

	it('moves across sections and back', () => {
		const moved = splice(SAMPLE, { op: 'move', id: 'BP3', to: { before: 'NW9' } });
		expect(ids(moved)).toEqual(['BP3', 'NW9', 'A1a']);
		expect(splice(moved, { op: 'move', id: 'BP3', to: { section: 2, at: 'end' } })).toBe(SAMPLE);
	});

	it('removes, taking the gap with the item', () => {
		const out = splice(SAMPLE, { op: 'remove', id: 'NW9' });
		expect(out).toContain('*Intro.*\n\n### A1a');
		const last = splice(SAMPLE, { op: 'remove', id: 'BP3' });
		expect(last.endsWith('## Later\n')).toBe(true);
	});

	it('throws for an unknown id', () => {
		expect(() => splice(SAMPLE, { op: 'remove', id: 'ZZ1' })).toThrow(SpliceError);
	});
});

group('describe, suggestId and checkId', () => {
	const b = parseBacklog(SAMPLE);
	it('writes the commit message', () => {
		expect(describe({ op: 'edit', id: 'NW9', change: {} }, b)).toBe('Backlog: edit NW9 DXF export');
		expect(describe({ op: 'remove', id: 'BP3' }, b)).toBe('Backlog: remove BP3 Filtering');
	});

	it('suggests the next id, counting ids that are gone', () => {
		expect(suggestId('BP', ['BP1', 'BP11', 'NW20', 'BP3a'])).toBe('BP12');
		expect(suggestId(null, ['NW1', 'NW2', 'A1', 'NW9', '5.8'])).toBe('NW10');
		expect(suggestId('FM', ['5.8'])).toBe('FM1');
	});

	it('checks an id', () => {
		expect(checkId('BP12', ['BP11'])).toBeNull();
		expect(checkId('5.8', [])).toBeNull();
		expect(checkId('BP11', ['BP11'])).toMatch(/already in use/);
		expect(checkId('bp12', [])).toMatch(/not an id/);
	});
});

// The round-trip properties from spike 0.2, on the real files.
group.each(['orchard', 'lantern'] as const)('splice on the %s backlog', (repo) => {
	const text = fixture(repo, 'backlog.md');
	const b = parseBacklog(text);
	const texts = (t: string) =>
		Object.fromEntries(parseBacklog(t).items.map((i) => [i.id, t.slice(i.start, i.end)]));
	const orig = texts(text);
	// A spread of items, first and last included, to keep the suite quick: each check parses the
	// whole file. Spike 0.2 ran every item, every way, once (17,786 checks).
	const step = Math.ceil(b.items.length / 6);
	const sample = b.items.filter((_, i) => i % step === 0 || i === b.items.length - 1);

	it('a no-op edit of every item is byte-identical', () => {
		for (const it of b.items) {
			const op: Op = { op: 'edit', id: it.id, change: { meta: it.meta?.entries ?? [] } };
			expect(splice(text, op, b)).toBe(text);
		}
	});

	it('an edit changes only its item', { timeout: 60_000 }, () => {
		for (const it of sample) {
			const out = splice(text, {
				op: 'edit',
				id: it.id,
				change: {
					title: 'Edited £ title',
					meta: meta('**Status:** in progress · **Branch:** `feat/x`'),
					body: 'New, with ★ and £.'
				}
			});
			const after = texts(out);
			for (const x of b.items) if (x.id !== it.id) expect(after[x.id]).toBe(orig[x.id]);
			expect(ids(out)).toEqual(ids(text));
			const edited = parseBacklog(out).items.find((x) => x.id === it.id)!;
			expect(edited.title).toBe('Edited £ title');
			expect(edited.meta!.branches).toEqual(['feat/x']);
		}
	});

	it('a move and the move back is the identity', { timeout: 60_000 }, () => {
		const n = b.items.length;
		for (const it of sample) {
			const i = b.items.indexOf(it);
			const next = b.items[i + 1]?.section === it.section ? b.items[i + 1].id : null;
			const prev = b.items[i - 1]?.section === it.section ? b.items[i - 1].id : null;
			const back = next
				? { before: next }
				: prev
					? { after: prev }
					: { section: it.section!, at: 'end' as const };
			for (const j of [0, n - 1]) {
				if (j === i) continue;
				for (const to of [{ before: b.items[j].id }, { after: b.items[j].id }]) {
					const moved = splice(text, { op: 'move', id: it.id, to });
					expect(texts(moved)).toEqual(orig);
					expect(splice(moved, { op: 'move', id: it.id, to: back })).toBe(text);
				}
			}
		}
	});

	it('removing an item removes exactly that id', () => {
		for (const it of sample)
			expect(ids(splice(text, { op: 'remove', id: it.id }, b))).toEqual(
				ids(text).filter((x) => x !== it.id)
			);
	});
});
