import { describe, expect, it } from 'vitest';
import { formatMeta, idKind, normaliseStatus, parseMeta, updateMeta } from './meta.ts';

describe('parseMeta', () => {
	it('reads the known keys', () => {
		const m = parseMeta(
			'**Status:** in progress · **Size:** S–M · **Job:** PRO · **Branch:** `feat/nw9-dxf-export` · **Plan:** 49, 50, 52'
		)!;
		expect(m.status).toBe('in progress');
		expect(m.size).toBe('S–M');
		expect(m.job).toBe('PRO');
		expect(m.branches).toEqual(['feat/nw9-dxf-export']);
		expect(m.plan).toEqual(['49', '50', '52']);
		expect(m.unknown).toEqual([]);
	});

	it('is case-insensitive in keys and keeps unknown keys as written', () => {
		const m = parseMeta('**status:** Todo · **Owner:** Nick')!;
		expect(m.status).toBe('todo');
		expect(m.unknown).toEqual([{ key: 'Owner', value: 'Nick' }]);
	});

	it('only reads a line that begins with Status', () => {
		expect(parseMeta('**Specced:** `specs/dxf-export.md` · **Size:** M')).toBeNull();
		expect(parseMeta('The prose begins here.')).toBeNull();
		expect(parseMeta('Status: todo')).toBeNull();
	});

	it('lets a value contain the separator', () => {
		const m = parseMeta(
			'**Status:** blocked · **Waiting:** the lawyer · then the bank · **Size:** S'
		)!;
		expect(m.waiting).toBe('the lawyer · then the bank');
		expect(m.size).toBe('S');
	});

	it('keeps an unrecognised status as raw text', () => {
		const m = parseMeta('**Status:** parked')!;
		expect(m.status).toBeNull();
		expect(m.statusRaw).toBe('parked');
	});

	it('round-trips through formatMeta', () => {
		const line = '**Status:** built · **Size:** M · **Waiting:** the three fixtures opened in CAD';
		expect(formatMeta(parseMeta(line)!.entries)).toBe(line);
	});
});

describe('normaliseStatus', () => {
	it.each([
		['built*', 'built'],
		['built\\*', 'built'],
		['In  Progress', 'in progress'],
		['done', 'done'],
		['finished', null]
	])('%s → %s', (raw, want) => expect(normaliseStatus(raw)).toBe(want));
});

describe('idKind', () => {
	it.each([
		['NW9', 'letter'],
		['A1a', 'letter'],
		['FM12', 'letter'],
		['5.8', 'task'],
		['3.6b', 'task'],
		['46', 'task'],
		['nw9', null],
		['A1B', null],
		['NWXYZ1', null],
		['Start', null]
	])('%s → %s', (token, want) => expect(idKind(token)).toBe(want));
});

describe('updateMeta', () => {
	const line = '**Status:** todo · **Size:** M · **Owner:** Nick · **Plan:** 46';
	const entries = parseMeta(line)!.entries;

	it('changes values in place and keeps unknown keys', () => {
		expect(formatMeta(updateMeta(entries, { status: 'in progress', size: 'M' }))).toBe(
			'**Status:** in progress · **Size:** M · **Owner:** Nick · **Plan:** 46'
		);
	});

	it('adds new keys in the usual order, and removes emptied ones', () => {
		expect(
			formatMeta(
				updateMeta(entries, {
					status: 'blocked',
					branch: 'feat/nw9-dxf',
					waiting: 'the bank',
					plan: []
				})
			)
		).toBe(
			'**Status:** blocked · **Size:** M · **Branch:** `feat/nw9-dxf` · **Waiting:** the bank · **Owner:** Nick'
		);
	});

	it('builds a line from nothing', () => {
		expect(formatMeta(updateMeta([], { status: 'todo', size: 'S', plan: ['5.8', ' 5.9 '] }))).toBe(
			'**Status:** todo · **Size:** S · **Plan:** 5.8, 5.9'
		);
	});
});
