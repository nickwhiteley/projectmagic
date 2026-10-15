import { describe, expect, it } from 'vitest';
import { parseBacklog, type Item } from './backlog.ts';
import { editChange, formValues, statusChange } from './edit-form.ts';
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

	it('assigns an item with For, and takes it off again (PM16)', () => {
		const change = editChange(item, { ...formValues(item), assignee: 'agent.claude' });
		const out = splice(text, { op: 'edit', id: 'C1', change });
		expect(out).toBe(text.replace('**Size:** M', '**Size:** M · **For:** agent.claude'));
		const again = editable(parseBacklog(out).items[0]);
		expect(formValues(again).assignee).toBe('agent.claude');
		const cleared = splice(out, {
			op: 'edit',
			id: 'C1',
			change: editChange(again, { ...formValues(again), assignee: '' })
		});
		expect(cleared).toBe(text);
	});

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

describe('statusChange (the Board drag, PM27)', () => {
	const text = `## Now

### C1 Publish the catalogue
**Status:** built · **Waiting:** Nick's check · **Size:** M

Body.

### C2 No meta line
Body.
`;
	const b = parseBacklog(text);
	const [c1, c2] = b.items.map(editable);
	const apply = (id: string, change: ReturnType<typeof statusChange>) =>
		splice(text, { op: 'edit', id, change });

	it('built to done changes the status and clears the waiting reason', () => {
		expect(apply('C1', statusChange(c1, 'done'))).toBe(
			text.replace(
				"**Status:** built · **Waiting:** Nick's check · **Size:** M",
				'**Status:** done · **Size:** M'
			)
		);
	});

	it('is the same edit as saving the form with that status', () => {
		const viaForm = editChange(c1, { ...formValues(c1), status: 'todo' });
		expect(statusChange(c1, 'todo')).toEqual(viaForm);
	});

	it('sets the waiting reason for blocked, and keeps it otherwise', () => {
		const out = apply('C1', statusChange(c1, 'blocked', 'the lawyer'));
		expect(out).toContain('**Status:** blocked · **Waiting:** the lawyer · **Size:** M');
		expect(apply('C1', statusChange(c1, 'blocked'))).toContain("**Waiting:** Nick's check");
	});

	it('an item with no meta line gets one', () => {
		expect(apply('C2', statusChange(c2, 'todo'))).toContain(
			'### C2 No meta line\n**Status:** todo'
		);
	});

	it('changes nothing when the status is already that', () => {
		expect(statusChange(c1, 'built')).toEqual({});
	});
});
