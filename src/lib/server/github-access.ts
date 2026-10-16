// The GitHub calls a claim makes (specs/tenants.md §3.2), as the person and as the App.
import { asApp } from './github-app.ts';
import type { GitHubAccess, InstallationInfo } from './installations.ts';
import { userClient } from './user-token.ts';

export function githubAccessFor(userId: string): GitHubAccess {
	const gh = userClient(userId);
	return {
		async visibleInstallationIds() {
			const ids: number[] = [];
			let url: string | null = '/user/installations?per_page=100';
			while (url) {
				const page: { body: { installations: { id: number }[] }; next: string | null } =
					await gh.rest<{
						installations: { id: number }[];
					}>(url);
				ids.push(...page.body.installations.map((i) => i.id));
				url = page.next;
			}
			return ids;
		},
		async orgRole(org) {
			const r = await gh.send<{ role?: string; state?: string }>(
				'GET',
				`/user/memberships/orgs/${encodeURIComponent(org)}`
			);
			return r.status === 200 && r.body.state !== 'pending' ? (r.body.role ?? null) : null;
		},
		async fetchInstallation(id) {
			const r = await asApp().send<InstallationInfo>('GET', `/app/installations/${id}`);
			return r.status === 200 ? r.body : null;
		}
	};
}
