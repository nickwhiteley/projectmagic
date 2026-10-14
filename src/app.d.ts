// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
	namespace App {
		// interface Error {}
		interface Locals {
			user: import('#lib/server/users.ts').SessionUser | null;
			memberships: import('#lib/core/access.ts').Membership[];
			/** On a project route, the project, already checked with can(). */
			project: import('#lib/server/projects.ts').ProjectRow | null;
			/** Project states loaded during this request, so layout and page share one load. */
			states: Map<string, Promise<import('#lib/core/state.ts').ProjectState>>;
		}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}
}

export {};
