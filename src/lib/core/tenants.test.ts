import { describe, expect, it } from 'vitest';
import { nameProblem, parseSignup, slugify, slugProblem } from './tenants.ts';

describe('slugify', () => {
	it.each([
		['Acme Ltd', 'acme-ltd'],
		['  Café  Münster! ', 'cafe-munster'],
		['A&O Shearman', 'a-o-shearman'],
		['x'.repeat(60), 'x'.repeat(40)],
		['ab-'.repeat(20), 'ab-'.repeat(13) + 'a']
	])('%j -> %j', (name, slug) => expect(slugify(name)).toBe(slug));
});

describe('slugProblem', () => {
	it('accepts a good slug', () => expect(slugProblem('acme-ltd')).toBeNull());
	it.each(['ab', 'Acme', 'has space', '-lead', 'trail-', 'x'.repeat(41), 'admin'])(
		'refuses %j',
		(s) => expect(slugProblem(s)).not.toBeNull()
	);
});

describe('nameProblem', () => {
	it('wants 2 to 80 characters', () => {
		expect(nameProblem(' ')).not.toBeNull();
		expect(nameProblem('Acme')).toBeNull();
		expect(nameProblem('x'.repeat(81))).not.toBeNull();
	});
});

describe('parseSignup', () => {
	it('defaults to closed', () => {
		expect(parseSignup(undefined)).toBe('closed');
		expect(parseSignup('anything')).toBe('closed');
		expect(parseSignup('open')).toBe('open');
		expect(parseSignup('approval')).toBe('approval');
	});
});
