// What every route requires (spec §11.2). The hook looks each request's route up here and checks
// it with can(); a route missing from this table is refused, and a test fails until it is added.
import type { ProjectAction, SystemAction } from '#lib/core/access.ts';

export type RouteAccess =
	/** Anyone, signed in or not. */
	| { kind: 'public' }
	/** Any signed-in user; what they see is filtered by can(). */
	| { kind: 'signed-in' }
	/** A project from the `[repo]` param; a project the user can't view is a 404. */
	| { kind: 'project'; action: ProjectAction }
	| { kind: 'system'; action: SystemAction }
	/** Machine endpoints that verify their own caller: the webhook's signature, the cron's secret. */
	| { kind: 'machine' };

export const ROUTES: Record<string, RouteAccess> = {
	// Signed out, the home page; signed in, the overview.
	'/': { kind: 'public' },
	'/search': { kind: 'signed-in' },
	'/activity': { kind: 'signed-in' },
	'/settings/ai': { kind: 'signed-in' },
	'/ask': { kind: 'signed-in' },
	'/signin': { kind: 'public' },
	'/auth/github': { kind: 'public' },
	'/auth/github/callback': { kind: 'public' },
	'/auth/signout': { kind: 'public' },
	'/api/github/webhook': { kind: 'machine' },
	'/api/cron/sync': { kind: 'machine' },
	'/p/[repo]': { kind: 'project', action: 'view' },
	'/p/[repo]/board': { kind: 'project', action: 'view' },
	'/p/[repo]/raw/[...path]': { kind: 'project', action: 'view' },
	'/p/[repo]/epics': { kind: 'project', action: 'view' },
	'/p/[repo]/plan': { kind: 'project', action: 'view' },
	'/p/[repo]/done': { kind: 'project', action: 'view' },
	'/p/[repo]/branches': { kind: 'project', action: 'view' },
	'/p/[repo]/docs/[...path]': { kind: 'project', action: 'view' },
	'/p/[repo]/i/[id]': { kind: 'project', action: 'view' },
	'/p/[repo]/i/[id]/edit': { kind: 'project', action: 'edit' },
	'/p/[repo]/new': { kind: 'project', action: 'edit' },
	'/p/[repo]/edits/merge': { kind: 'project', action: 'merge' },
	'/p/[repo]/sync': { kind: 'project', action: 'view' }
};
