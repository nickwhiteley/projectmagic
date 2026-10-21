import { describe, expect, it } from 'vitest';
import { safeBack } from './edit-actions.ts';

describe('safeBack', () => {
	it('goes back to a path on this site', () => {
		expect(safeBack('/', '/x')).toBe('/');
		expect(safeBack('/p/orchard/i/B1', '/x')).toBe('/p/orchard/i/B1');
	});
	it('never leaves the site', () => {
		for (const to of [
			'https://evil.example',
			'//evil.example',
			'/\\evil.example',
			'/\t/evil.example',
			'/\n/evil.example',
			'/\x00/evil.example',
			'/\x7f/evil.example',
			'/ /evil.example',
			'',
			'p/x'
		])
			expect(safeBack(to, '/x'), to).toBe('/x');
		expect(safeBack(null, '/x')).toBe('/x');
	});
});
