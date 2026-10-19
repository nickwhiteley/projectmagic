import { describe, expect, it } from 'vitest';
import { findRefs, isHere, parseRef } from './crossref.ts';

describe('crossref (PM36)', () => {
	it('reads <repo>:<id>, the repo in lower case and the id as a backlog writes it', () => {
		expect(parseRef('Plinth:pl4')).toEqual({ repo: 'plinth', id: 'PL4' });
		expect(parseRef('`bloomprint:A1a`')).toEqual({ repo: 'bloomprint', id: 'A1a' });
		expect(parseRef('owner--web:W3')).toEqual({ repo: 'owner--web', id: 'W3' });
		expect(parseRef('PL4')).toBeNull();
		expect(parseRef(':PL4')).toBeNull();
		expect(parseRef('plinth:release')).toBeNull();
	});

	it('finds references in free text, once each, and not in URLs or times', () => {
		expect(findRefs('plinth:PL4 being released, then bloomprint:BP40; plinth:PL4 again')).toEqual([
			{ repo: 'plinth', id: 'PL4' },
			{ repo: 'bloomprint', id: 'BP40' }
		]);
		expect(findRefs('https://example.com:PL4 at 10:30, see http://x/plinth:PL4')).toEqual([]);
		expect(findRefs("Nick's check")).toEqual([]);
	});

	it('knows its own repository by name or owner--repo', () => {
		const here = { owner: 'nickwhiteley', repo: 'Plinth' };
		expect(isHere('plinth', here)).toBe(true);
		expect(isHere('nickwhiteley--plinth', here)).toBe(true);
		expect(isHere('bloomprint', here)).toBe(false);
	});
});
