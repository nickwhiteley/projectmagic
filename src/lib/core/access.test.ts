import { describe, expect, it } from 'vitest';
import {
	can,
	parseRepoParam,
	PLATFORM_ACTIONS,
	PROJECT_ACTIONS,
	repoParam,
	roleOn,
	TENANT_ACTIONS,
	visibleProjects,
	type Action,
	type Ctx,
	type Membership,
	type Project,
	type TenantContext,
	type TenantRole,
	type User
} from './access.ts';

const project: Project = { id: 'p1', hidden: false, tenantId: 't1' };
const hidden: Project = { id: 'p2', hidden: true, tenantId: 't1' };
const elsewhere: Project = { id: 'p9', hidden: false, tenantId: 't2' };
const user = (
	id: string,
	platformRole: User['platformRole'] = 'none',
	disabledAt: string | null = null
): User => ({ id, platformRole, disabledAt });
const memberships: Membership[] = [
	{ userId: 'v', projectId: 'p1', role: 'viewer' },
	{ userId: 'e', projectId: 'p1', role: 'editor' },
	{ userId: 'm', projectId: 'p1', role: 'maintainer' },
	{ userId: 'v', projectId: 'p2', role: 'viewer' },
	{ userId: 'm', projectId: 'p2', role: 'maintainer' },
	{ userId: 'x', projectId: 'p1', role: 'maintainer' },
	{ userId: 'm', projectId: 'p9', role: 'maintainer' }
];
const tenant = (role: TenantRole | null, over: Partial<TenantContext> = {}): TenantContext => ({
	id: 't1',
	status: 'active',
	role,
	...over
});
const ctx = (
	role: TenantRole | null,
	over: Partial<TenantContext> = {},
	p: Project | null = project
): Ctx => ({
	tenant: tenant(role, over),
	project: p,
	memberships
});

const actions = [
	...Object.keys(PROJECT_ACTIONS),
	...Object.keys(TENANT_ACTIONS),
	...PLATFORM_ACTIONS
] as Action[];
const ofUser = (u: User | null, c: Ctx) => actions.filter((a) => can(u, a, c));

const PROJECT_ALL: Action[] = ['view', 'edit', 'merge', 'hide', 'manage-members'];
const TENANT_ALL = Object.keys(TENANT_ACTIONS) as Action[];

describe('can: project roles, every role against every action', () => {
	const rows: [string, User | null, Action[]][] = [
		['signed out', null, []],
		['member with no project role', user('n'), ['tenant.view']],
		['viewer', user('v'), ['tenant.view', 'view']],
		['editor', user('e'), ['tenant.view', 'view', 'edit']],
		['maintainer', user('m'), ['tenant.view', ...PROJECT_ALL]],
		['disabled maintainer', user('x', 'none', '2026-10-01'), []]
	];
	it.each(rows)('%s', (_, u, want) => {
		expect(ofUser(u, ctx('member'))).toEqual(actions.filter((a) => want.includes(a)));
	});

	it('a tenant admin is a maintainer on every project in the tenant, and runs the tenant', () => {
		expect(ofUser(user('a'), ctx('admin'))).toEqual(
			[...PROJECT_ALL, ...TENANT_ALL].sort((a, b) => actions.indexOf(a) - actions.indexOf(b))
		);
	});

	it('hides a hidden project from everyone but maintainers', () => {
		expect(can(user('v'), 'view', ctx('member', {}, hidden))).toBe(false);
		expect(can(user('m'), 'view', ctx('member', {}, hidden))).toBe(true);
		expect(can(user('a'), 'hide', ctx('admin', {}, hidden))).toBe(true);
	});

	it('needs a project for a project action', () => {
		expect(can(user('a'), 'view', ctx('admin', {}, null))).toBe(false);
		expect(can(user('a'), 'tenant.settings', ctx('admin', {}, null))).toBe(true);
	});
});

describe('can: the tenant layer', () => {
	it('lets only a tenant admin run the tenant', () => {
		expect(ofUser(user('n'), ctx('member', {}, null))).toEqual(['tenant.view']);
		expect(ofUser(user('a'), ctx('admin', {}, null))).toEqual(TENANT_ALL);
	});

	it('refuses a user who is not in the tenant', () => {
		expect(ofUser(user('m'), ctx(null))).toEqual([]);
	});

	it('refuses everything without a tenant', () => {
		expect(ofUser(user('m'), { tenant: null, project, memberships })).toEqual([]);
	});

	it.each(['suspended', 'pending'] as const)(
		'a %s tenant allows only its notice and billing',
		(status) => {
			expect(ofUser(user('a'), ctx('admin', { status }))).toEqual([
				'tenant.view',
				'tenant.billing'
			]);
			expect(ofUser(user('m'), ctx('member', { status }))).toEqual(['tenant.view']);
		}
	);

	it('a deleted tenant allows nothing', () => {
		expect(ofUser(user('a'), ctx('admin', { status: 'deleted' }))).toEqual([]);
	});
});

describe('can: the platform layer', () => {
	it('lets only a platform admin run the service', () => {
		expect(ofUser(user('p', 'admin'), { tenant: null, memberships })).toEqual([
			...PLATFORM_ACTIONS
		]);
		expect(
			ofUser(user('m'), { tenant: null, memberships }).filter((a) => a.startsWith('platform.'))
		).toEqual([]);
	});

	it('does not let a project or tenant role grant a platform action', () => {
		expect(can(user('a'), 'platform.tenants', ctx('admin'))).toBe(false);
	});

	it('gives a platform admin no access to a tenant they are not in', () => {
		expect(ofUser(user('p', 'admin'), ctx(null))).toEqual([...PLATFORM_ACTIONS]);
	});

	it('gives a platform admin read-only access in a support session, and nothing else', () => {
		expect(ofUser(user('p', 'admin'), ctx(null, { support: true }))).toEqual(
			['view', 'tenant.view', ...PLATFORM_ACTIONS].sort(
				(a, b) => actions.indexOf(a as Action) - actions.indexOf(b as Action)
			)
		);
	});

	it('does not let a support session turn a non-admin into a viewer', () => {
		expect(ofUser(user('m'), ctx(null, { support: true }))).toEqual([]);
	});
});

describe('isolation between tenants', () => {
	it('a project in another tenant is out of reach, whatever the roles', () => {
		const c = ctx('admin', {}, elsewhere);
		expect(ofUser(user('m'), c).filter((a) => PROJECT_ALL.includes(a))).toEqual([]);
		expect(roleOn(user('m'), c)).toBeNull();
	});

	it('does not let a project membership in another tenant count', () => {
		expect(can(user('m'), 'view', ctx('member', {}, elsewhere))).toBe(false);
	});
});

describe('default and overridden project roles', () => {
	const managed = (def: 'none' | 'viewer' | 'editor') =>
		ctx(
			'member',
			{ access: 'managed', defaultProjectRole: def },
			{ id: 'p3', hidden: false, tenantId: 't1' }
		);

	it('gives managed access a default role on a project nobody set a role on', () => {
		expect(ofUser(user('n'), managed('viewer')).filter((a) => a in PROJECT_ACTIONS)).toEqual([
			'view'
		]);
		expect(ofUser(user('n'), managed('editor')).filter((a) => a in PROJECT_ACTIONS)).toEqual([
			'view',
			'edit'
		]);
		expect(ofUser(user('n'), managed('none')).filter((a) => a in PROJECT_ACTIONS)).toEqual([]);
	});

	it('does not apply the default under access by GitHub', () => {
		const c = ctx(
			'member',
			{ access: 'github', defaultProjectRole: 'editor' },
			{ id: 'p3', hidden: false, tenantId: 't1' }
		);
		expect(can(user('n'), 'view', c)).toBe(false);
	});

	it('lets a role set on the project beat the default, up or down', () => {
		const c = {
			...managed('editor'),
			memberships: [
				{ userId: 'n', projectId: 'p3', role: 'none' as const },
				{ userId: 'u', projectId: 'p3', role: 'maintainer' as const }
			]
		};
		expect(can(user('n'), 'view', c)).toBe(false);
		expect(can(user('u'), 'merge', c)).toBe(true);
	});
});

describe('visibleProjects', () => {
	it('lists what the user can view', () => {
		const ps = [project, hidden, { id: 'p3', hidden: false, tenantId: 't1' }, elsewhere];
		const ids = (u: User | null, role: TenantRole) =>
			visibleProjects(u, ps, ctx(role, {}, null)).map((p) => p.id);
		expect(ids(user('v'), 'member')).toEqual(['p1']);
		expect(ids(user('a'), 'admin')).toEqual(['p1', 'p2', 'p3']);
		expect(ids(null, 'member')).toEqual([]);
	});
});

describe('repository addresses', () => {
	it('splits owner--repo', () => {
		expect(parseRepoParam('web')).toEqual({ owner: null, repo: 'web' });
		expect(parseRepoParam('acme--web')).toEqual({ owner: 'acme', repo: 'web' });
		expect(parseRepoParam('--web')).toEqual({ owner: null, repo: '--web' });
	});

	it('uses the long form only where the name is shared', () => {
		const all = [
			{ owner: 'acme', repo: 'web' },
			{ owner: 'globex', repo: 'web' },
			{ owner: 'acme', repo: 'api' }
		];
		expect(repoParam(all[0], all)).toBe('acme--web');
		expect(repoParam(all[2], all)).toBe('api');
		expect(repoParam(all[0], all.slice(0, 1))).toBe('web');
	});
});
