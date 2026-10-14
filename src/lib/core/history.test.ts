import { describe, expect, it } from 'vitest';
import { advanceHistory, emptyHistory, type Version } from './history.ts';

const backlog = (...ids: string[]) =>
	'## Now\n\n' +
	ids.map((id) => `### ${id} Title of ${id}\n**Status:** todo\n\nBody of ${id}.\n`).join('\n');

let n = 0;
const v = (text: string | null, pr: number | null = null): Version => {
	n++;
	return { oid: `c${n}`, date: `2026-10-${String(n).padStart(2, '0')}T12:00:00Z`, pr, text };
};

describe('advanceHistory', () => {
	n = 0;
	const versions = [
		v(backlog('A1', 'B2', 'C3')),
		v(backlog('A1', 'C3'), 12), // B2 shipped in PR 12
		v(null), // the file was missing for a commit: nothing is inferred
		v(backlog('C3', 'D4')), // A1 shipped
		v(backlog('A1', 'C3', 'D4')) // A1 came back
	];
	const all = advanceHistory(emptyHistory(), versions);

	it('marks an id done at the commit that removed it, with its last text', () => {
		expect(all.done.get('B2')).toEqual({
			id: 'B2',
			title: 'Title of B2',
			text: '### B2 Title of B2\n**Status:** todo\n\nBody of B2.\n',
			removedOid: 'c2',
			removedAt: '2026-10-02T12:00:00Z',
			pr: 12
		});
	});

	it('forgets an id that reappears', () => {
		expect(all.done.has('A1')).toBe(false);
		expect([...all.done.keys()]).toEqual(['B2']);
	});

	it('skips versions where the file is missing, rather than calling everything done', () => {
		expect(all.done.has('C3')).toBe(false);
	});

	it('continues from a saved state exactly as a single walk would', () => {
		const first = advanceHistory(emptyHistory(), versions.slice(0, 2));
		const rest = advanceHistory(first, versions.slice(2));
		expect(rest).toEqual(all);
		expect(first.done.has('B2')).toBe(true);
		expect(first.lastOid).toBe('c2');
		expect(rest.lastOid).toBe('c5');
	});

	it('does not change the state it was given', () => {
		const s = emptyHistory();
		advanceHistory(s, versions);
		expect(s).toEqual(emptyHistory());
	});

	it('treats nothing as done on the first version', () => {
		n = 100;
		expect(advanceHistory(emptyHistory(), [v(backlog('X1'))]).done.size).toBe(0);
	});
});
