import { describe, expect, it } from 'vitest';
import {
	can,
	PROJECT_ACTIONS,
	SYSTEM_ACTIONS,
	visibleProjects,
	type Action,
	type Membership,
	type Project,
	type User
} from './access';

const project: Project = { id: 'p1', hidden: false };
const hidden: Project = { id: 'p2', hidden: true };
const user = (
	id: string,
	systemRole: User['systemRole'] = 'member',
	disabledAt: string | null = null
): User => ({
	id,
	systemRole,
	disabledAt
});
const memberships: Membership[] = [
	{ userId: 'v', projectId: 'p1', role: 'viewer' },
	{ userId: 'e', projectId: 'p1', role: 'editor' },
	{ userId: 'm', projectId: 'p1', role: 'maintainer' },
	{ userId: 'v', projectId: 'p2', role: 'viewer' },
	{ userId: 'm', projectId: 'p2', role: 'maintainer' },
	{ userId: 'x', projectId: 'p1', role: 'maintainer' }
];

const actions = [...Object.keys(PROJECT_ACTIONS), ...SYSTEM_ACTIONS] as Action[];

// Every role against every action, on a visible project. A row is what that user can do.
const TABLE: Record<string, User | null> = {
	'signed out': null,
	'no membership': user('n'),
	viewer: user('v'),
	editor: user('e'),
	maintainer: user('m'),
	admin: user('a', 'admin'),
	'disabled maintainer': user('x', 'member', '2026-10-01')
};
const EXPECTED: Record<string, Action[]> = {
	'signed out': [],
	'no membership': [],
	viewer: ['view'],
	editor: ['view', 'edit'],
	maintainer: ['view', 'edit', 'merge', 'hide', 'manage-members'],
	admin: [
		'view',
		'edit',
		'merge',
		'hide',
		'manage-members',
		'invite-users',
		'disable-users',
		'install-app'
	],
	'disabled maintainer': []
};

describe('can', () => {
	it.each(Object.keys(TABLE))('%s', (who) => {
		expect(actions.filter((a) => can(TABLE[who], a, project, memberships))).toEqual(EXPECTED[who]);
	});

	it('hides a hidden project from everyone but maintainers', () => {
		expect(can(user('v'), 'view', hidden, memberships)).toBe(false);
		expect(can(user('m'), 'view', hidden, memberships)).toBe(true);
		expect(can(user('a', 'admin'), 'hide', hidden, memberships)).toBe(true);
	});

	it('needs a project for a project action', () => {
		expect(can(user('a', 'admin'), 'view', null, memberships)).toBe(false);
		expect(can(user('a', 'admin'), 'install-app', null, memberships)).toBe(true);
	});

	it('does not let a project role grant a system action', () => {
		expect(can(user('m'), 'invite-users', project, memberships)).toBe(false);
	});
});

describe('visibleProjects', () => {
	it('lists what the user can view', () => {
		const ps = [project, hidden, { id: 'p3', hidden: false }];
		expect(visibleProjects(user('v'), ps, memberships).map((p) => p.id)).toEqual(['p1']);
		expect(visibleProjects(user('a', 'admin'), ps, memberships).map((p) => p.id)).toEqual([
			'p1',
			'p2',
			'p3'
		]);
		expect(visibleProjects(null, ps, memberships)).toEqual([]);
	});
});
