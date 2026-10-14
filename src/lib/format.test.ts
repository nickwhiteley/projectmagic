import { describe, expect, it } from 'vitest';
import { ago, plural } from './format.ts';

describe('ago', () => {
	const now = Date.parse('2026-10-14T12:00:00Z');
	it.each([
		['2026-10-14T11:59:30Z', 'just now'],
		['2026-10-14T11:48:00Z', '12 min ago'],
		['2026-10-14T09:00:00Z', '3 h ago'],
		['2026-10-13T11:00:00Z', '1 day ago'],
		['2026-10-10T12:00:00Z', '4 days ago'],
		['2026-08-01T12:00:00Z', '2026-08-01']
	])('%s → %s', (iso, want) => expect(ago(iso, now)).toBe(want));
	it('says never for nothing', () => expect(ago(null)).toBe('never'));
});

describe('plural', () => {
	it('chooses the form', () => {
		expect(plural(1, 'item')).toBe('1 item');
		expect(plural(3, 'item')).toBe('3 items');
		expect(plural(2, 'branch', 'branches')).toBe('2 branches');
	});
});
