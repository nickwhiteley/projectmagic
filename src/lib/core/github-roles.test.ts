import { describe, expect, it } from 'vitest';
import { planGithubRoles, roleFromPermissions } from './github-roles.ts';

describe('roleFromPermissions', () => {
	it.each([
		[{ admin: true, push: true, pull: true }, 'maintainer'],
		[{ maintain: true, push: true, pull: true }, 'maintainer'],
		[{ push: true, pull: true }, 'editor'],
		[{ triage: true, pull: true }, 'viewer'],
		[{ pull: true }, 'viewer'],
		[{}, null],
		[null, null],
		[undefined, null]
	])('%j -> %s', (p, role) => expect(roleFromPermissions(p)).toBe(role));
});

describe('planGithubRoles', () => {
	const reported = new Map<string, 'viewer' | 'editor' | 'maintainer'>([
		['1', 'editor'],
		['2', 'viewer'],
		['3', 'maintainer']
	]);

	it('writes what GitHub reports and removes derived roles it no longer does', () => {
		const plan = planGithubRoles(reported, [
			{ projectId: '1', source: 'github', role: 'viewer' },
			{ projectId: '9', source: 'github', role: 'editor' }
		]);
		expect(plan.upsert.map((u) => u.projectId)).toEqual(['1', '2', '3']);
		expect(plan.remove).toEqual(['9']);
	});

	it('leaves a manual row alone, up or down, and never removes it', () => {
		const plan = planGithubRoles(reported, [
			{ projectId: '2', source: 'manual', role: 'none' },
			{ projectId: '8', source: 'manual', role: 'maintainer' }
		]);
		expect(plan.upsert.map((u) => u.projectId)).toEqual(['1', '3']);
		expect(plan.remove).toEqual([]);
	});
});
