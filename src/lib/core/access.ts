// Who may do what (spec §11.2). One pure function decides; every route and server action calls
// it, and none checks roles inline. GitHub still has the last word on writes: edits use the
// user's own token, so this can never grant more than GitHub does.

export const PROJECT_ROLES = ['viewer', 'editor', 'maintainer'] as const;
export type ProjectRole = (typeof PROJECT_ROLES)[number];

export interface User {
	id: string;
	systemRole: 'admin' | 'member';
	disabledAt: string | null;
}

export interface Project {
	id: string;
	hidden: boolean;
}

export interface Membership {
	userId: string;
	projectId: string;
	role: ProjectRole;
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

/** What only a system administrator may do. */
export const SYSTEM_ACTIONS = ['invite-users', 'disable-users', 'install-app'] as const;
export type SystemAction = (typeof SYSTEM_ACTIONS)[number];

export type Action = ProjectAction | SystemAction;

const rank = (r: ProjectRole) => PROJECT_ROLES.indexOf(r);

/** The user's role on a project: an administrator is a maintainer everywhere. */
export function roleOn(
	user: User,
	project: Project,
	memberships: Membership[]
): ProjectRole | null {
	if (user.systemRole === 'admin') return 'maintainer';
	return memberships.find((m) => m.userId === user.id && m.projectId === project.id)?.role ?? null;
}

export function can(
	user: User | null,
	action: Action,
	project: Project | null,
	memberships: Membership[]
): boolean {
	if (!user || user.disabledAt) return false;
	if ((SYSTEM_ACTIONS as readonly string[]).includes(action)) return user.systemRole === 'admin';
	if (!project) return false;
	const role = roleOn(user, project, memberships);
	if (!role) return false;
	// A hidden project is out of everyone's way except a maintainer's, who can unhide it.
	if (project.hidden && rank(role) < rank('maintainer')) return false;
	return rank(role) >= rank(PROJECT_ACTIONS[action as ProjectAction]);
}

/** The projects on the overview and in search: those the user can view. Others are a 404. */
export function visibleProjects<P extends Project>(
	user: User | null,
	projects: P[],
	memberships: Membership[]
): P[] {
	return projects.filter((p) => can(user, 'view', p, memberships));
}
