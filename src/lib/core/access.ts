// Who may do what (specs/tenants.md §6.4). One pure function decides; every route and server
// action calls it, and none checks roles inline. GitHub still has the last word on writes: edits
// use the user's own token, so this can never grant more than GitHub does.
//
// Three layers, each a short ordered list: the platform (running the service), a tenant (a team),
// and a project (one repository). Being a platform admin grants nothing inside a tenant.

export const PROJECT_ROLES = ['viewer', 'editor', 'maintainer'] as const;
export type ProjectRole = (typeof PROJECT_ROLES)[number];

export const TENANT_ROLES = ['member', 'admin'] as const;
export type TenantRole = (typeof TENANT_ROLES)[number];

export type TenantStatus = 'pending' | 'active' | 'suspended' | 'deleted';

export interface User {
	id: string;
	platformRole: 'admin' | 'none';
	disabledAt: string | null;
}

export interface Project {
	id: string;
	hidden: boolean;
	tenantId: string;
}

export interface Membership {
	userId: string;
	projectId: string;
	/** `none` is a manual override that removes access derived from GitHub or the tenant's default. */
	role: ProjectRole | 'none';
}

/** How a tenant's project roles are decided (§6). */
export type AccessMode = 'github' | 'managed';

/** The tenant a request is made in, and what the user is to it. */
export interface TenantContext {
	id: string;
	status: TenantStatus;
	/** The user's role in the tenant, or null if they aren't a member. */
	role: TenantRole | null;
	/** A platform admin's read-only support session on this tenant (§6.3). */
	support?: boolean;
	/** With managed access, the role on a project nobody set a role on (§6.2). */
	defaultProjectRole?: 'none' | ProjectRole;
	access?: AccessMode;
}

export interface Ctx {
	tenant: TenantContext | null;
	project?: Project | null;
	memberships: Membership[];
}

/** What a project role allows, each role including the one before it. */
export const PROJECT_ACTIONS = {
	/** The overview card, backlog, plan, branches and docs. */
	view: 'viewer',
	/** Edit the backlog (§10). */
	edit: 'editor',
	/** Merge the edit PR with the Merge button. */
	merge: 'maintainer',
	hide: 'maintainer',
	'manage-members': 'maintainer'
} as const satisfies Record<string, ProjectRole>;
export type ProjectAction = keyof typeof PROJECT_ACTIONS;

/** What a tenant role allows. */
export const TENANT_ACTIONS = {
	'tenant.view': 'member',
	'tenant.members': 'admin',
	'tenant.installations': 'admin',
	'tenant.settings': 'admin',
	'tenant.billing': 'admin',
	'tenant.audit': 'admin',
	'tenant.delete': 'admin'
} as const satisfies Record<string, TenantRole>;
export type TenantAction = keyof typeof TENANT_ACTIONS;

/** What only a platform admin may do. */
export const PLATFORM_ACTIONS = [
	'platform.tenants',
	'platform.users',
	'platform.tiers',
	'platform.settings',
	'platform.support'
] as const;
export type PlatformAction = (typeof PLATFORM_ACTIONS)[number];

export type Action = ProjectAction | TenantAction | PlatformAction;

const projectRank = (r: ProjectRole) => PROJECT_ROLES.indexOf(r);
const tenantRank = (r: TenantRole) => TENANT_ROLES.indexOf(r);

/** A suspended or pending tenant allows only a look at its notice, and its billing. */
const WHEN_NOT_ACTIVE: readonly Action[] = ['tenant.view', 'tenant.billing'];
/** What a support session allows: looking, never changing. */
const SUPPORT_ALLOWED: readonly Action[] = ['tenant.view', 'view'];

/** The user's role on a project: a tenant admin is a maintainer on every project in the tenant. */
export function roleOn(user: User, ctx: Ctx): ProjectRole | null {
	const { tenant, project } = ctx;
	if (!tenant || !project || project.tenantId !== tenant.id) return null;
	if (tenant.role === 'admin') return 'maintainer';
	if (tenant.role !== 'member') return null;
	// A role set for them on the project, derived from GitHub or by an admin, decides.
	const set = ctx.memberships.find((m) => m.userId === user.id && m.projectId === project.id);
	if (set) return set.role === 'none' ? null : set.role;
	// With managed access, a project nobody set a role on falls back to the tenant's default.
	if (
		tenant.access === 'managed' &&
		tenant.defaultProjectRole &&
		tenant.defaultProjectRole !== 'none'
	)
		return tenant.defaultProjectRole;
	return null;
}

export function can(user: User | null, action: Action, ctx: Ctx): boolean {
	// 1. no user, or a disabled one: no.
	if (!user || user.disabledAt) return false;
	// 2. a platform action: only a platform admin.
	if ((PLATFORM_ACTIONS as readonly string[]).includes(action))
		return user.platformRole === 'admin';

	// 3. a tenant or project action: the tenant must be active, and the user its member, or a
	//    platform admin in a support session for the read-only actions.
	const tenant = ctx.tenant;
	if (!tenant || tenant.status === 'deleted') return false;
	if (tenant.status !== 'active' && !WHEN_NOT_ACTIVE.includes(action)) return false;
	if (tenant.support) {
		if (user.platformRole !== 'admin' || !SUPPORT_ALLOWED.includes(action)) return false;
	} else if (!tenant.role) return false;

	if (action in TENANT_ACTIONS) {
		if (tenant.support) return true;
		return tenantRank(tenant.role!) >= tenantRank(TENANT_ACTIONS[action as TenantAction]);
	}

	// 4. a project action: the project must be in that tenant; then the project role decides.
	const project = ctx.project;
	if (!project || project.tenantId !== tenant.id) return false;
	const role = tenant.support ? 'viewer' : roleOn(user, ctx);
	if (!role) return false;
	// A hidden project is out of everyone's way except a maintainer's, who can unhide it.
	if (project.hidden && projectRank(role) < projectRank('maintainer')) return false;
	return projectRank(role) >= projectRank(PROJECT_ACTIONS[action as ProjectAction]);
}

/** The projects on the overview and in search: those the user can view. Others are a 404. */
export function visibleProjects<P extends Project>(
	user: User | null,
	projects: P[],
	ctx: Ctx
): P[] {
	return projects.filter((p) => can(user, 'view', { ...ctx, project: p }));
}

/** Two repositories with the same name in one tenant (a `web` in each of two GitHub
 * organisations) are addressed `/p/{owner}--{repo}`. GitHub forbids `--` in account names, so
 * the split is unambiguous (§5). */
export function parseRepoParam(param: string): { owner: string | null; repo: string } {
	const i = param.indexOf('--');
	return i > 0
		? { owner: param.slice(0, i), repo: param.slice(i + 2) }
		: { owner: null, repo: param };
}

/** The form of a repository's URL segment that resolves: the bare name, unless another project
 * in the tenant shares it. */
export function repoParam(
	p: { owner: string; repo: string },
	all: { owner: string; repo: string }[]
): string {
	const clash = all.some(
		(o) =>
			o.repo.toLowerCase() === p.repo.toLowerCase() &&
			o.owner.toLowerCase() !== p.owner.toLowerCase()
	);
	return clash ? `${p.owner}--${p.repo}` : p.repo;
}
