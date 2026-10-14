import { describe, expect, it } from 'vitest';
import { parseBacklog, type Item } from './backlog.ts';
import { editChange, formValues } from './edit-form.ts';
import { fixture } from './fixtures.ts';
import { splice } from './splice.ts';

/** The form works on the view's shape, where meta is the entries. */
const editable = (it: Item) => ({ ...it, meta: it.meta?.entries ?? null });

describe.each(['orchard', 'lantern'] as const)('saving an untouched form, %s', (repo) => {
	const text = fixture(repo, 'backlog.md');
	const b = parseBacklog(text);

	it('changes nothing for any item', () => {
		for (const parsed of b.items) {
			const item = editable(parsed);
			const change = editChange(item, formValues(item));
			expect(change, item.id).toEqual({});
			expect(splice(text, { op: 'edit', id: item.id, change }, b)).toBe(text);
		}
	});
});

describe('editChange', () => {
	const text = `## Now

### ★ C1 Publish the catalogue — DOOR
**Status:** todo · **Size:** M · **Owner:** Nick

Body.
`;
	const item = editable(parseBacklog(text).items[0]);

	it('rewrites only the meta line for a status change, keeping the heading as written', () => {
		const out = splice(text, {
			op: 'edit',
			id: 'C1',
			change: editChange(item, { ...formValues(item), status: 'in progress' })
		});
		expect(out).toBe(text.replace('**Status:** todo', '**Status:** in progress'));
	});

	it('rebuilds the heading when its parts change', () => {
		const out = splice(text, {
			op: 'edit',
			id: 'C1',
			change: editChange(item, { ...formValues(item), star: false, job: 'MONEY' })
		});
		expect(out).toContain('### C1 Publish the catalogue — MONEY\n**Status:** todo');
	});

	it('gives an item without a meta line one', () => {
		const bare = editable(parseBacklog('## Now\n\n### X1 Bare\n\nProse.\n').items[0]);
		const change = editChange(bare, formValues(bare));
		expect(change.meta).toEqual([{ key: 'Status', value: 'todo' }]);
	});
});
