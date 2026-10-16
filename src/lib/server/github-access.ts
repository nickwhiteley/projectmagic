// The GitHub calls a claim or a sign-in makes (specs/tenants.md §3.2, §3.3), as the person and as the App.
import { asApp } from './github-app.ts';
import type { GitHubClient } from './github-client.ts';
import type { GitHubAccess, InstallationInfo } from './installations.ts';
import { userClient } from './user-token.ts';

/** The checks against a person's own GitHub token. */
export function githubAccessWith(gh: GitHubClient): GitHubAccess {
	return {
		async visibleInstallationIds() {
			const ids: number[] = [];
			let url: string | null = '/user/installations?per_page=100';
			while (url) {
				const page: { body: { installations: { id: number }[] }; next: string | null } =
					await gh.rest<{ installations: { id: number }[] }>(url);
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

export const githubAccessFor = (userId: string): GitHubAccess =>
	githubAccessWith(userClient(userId));

/** A GitHub account by login, as the numeric id and the login's own capitalisation; null if none. */
export async function lookupGithubUser(
	gh: GitHubClient,
	login: string
): Promise<{ id: number; login: string } | null> {
	if (!/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/.test(login)) return null;
	const r = await gh.send<{ id: number; login: string; type: string }>('GET', `/users/${login}`);
	return r.status === 200 && r.body.type === 'User' ? { id: r.body.id, login: r.body.login } : null;
}
