// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
	/** When this build was made (vite.config.ts). */
	const __BUILT_AT__: string;
	namespace App {
		interface Error {
			/** The reference of a recorded error (PM48), for the person to quote. */
			ref?: string;
		}
		interface Locals {
			user: import('#lib/server/users.ts').SessionUser | null;
			memberships: import('#lib/core/access.ts').Membership[];
			/** The tenant this request is made in (specs/tenants.md §5), or null if the user has none. */
			tenant: import('#lib/server/tenants.ts').TenantInfo | null;
			/** Every tenant the user belongs to, the current one first. */
			tenants: import('#lib/server/tenants.ts').TenantInfo[];
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
