// The GitHub App's own credentials (spec §11): a JWT signed with its private key, exchanged for
// installation tokens, which every read uses. Writes use the acting user's token instead.
import {
	GITHUB_APP_ID,
	GITHUB_APP_PRIVATE_KEY,
	GITHUB_APP_PRIVATE_KEY_PATH,
	GITHUB_CLIENT_ID,
	GITHUB_CLIENT_SECRET
} from '$app/env/private';
import { readFileSync } from 'node:fs';

import {
	API,
	appClient,
	GitHubError,
	installationToken as tokenFor,
	observeRateLimits,
	tokenClient,
	type GitHubClient
} from './github-client.ts';
import { errorText, type RateLimit } from '#lib/core/ops.ts';
import { db } from './db.ts';

// GitHub's budget as last seen (PM53), written at most every 30 seconds per scope and resource,
// and at once when it runs low, so the Operations tab is current without a write per call.
const written = new Map<string, number>();
observeRateLimits((scope, l: RateLimit) => {
	const key = `${scope}|${l.resource}`;
	const low = l.limit > 0 && l.remaining / l.limit < 0.2;
	if (!low && Date.now() - (written.get(key) ?? 0) < 30_000) return;
	written.set(key, Date.now());
	void db()`insert into github_budget (scope, resource, remaining, "limit", reset_at)
		values (${scope}, ${l.resource}, ${l.remaining}, ${l.limit}, ${l.resetAt})
		on conflict (scope, resource) do update set remaining = excluded.remaining, "limit" = excluded."limit",
			reset_at = excluded.reset_at, updated_at = now()`.catch(() => {});
});

/** Records whether GitHub gives the App a token for the installation (PM53): a refusal stops every
 * one of its projects, so it is shown on the installation, not only as each project's error. */
async function noteToken(installationId: number, error: string | null): Promise<void> {
	await db()`update installation set token_error = ${error}, token_error_at = ${error ? new Date() : null}
		where id = ${installationId} and token_error is distinct from ${error}`.catch(() => {});
}

/** Asks GitHub for the installation's token again, for the Operations tab's *Check again*. */
export async function checkInstallationToken(installationId: number): Promise<string | null> {
	try {
		await tokenFor(GITHUB_APP_ID, privateKey(), installationId, true);
		await noteToken(installationId, null);
		return null;
	} catch (e) {
		const text = errorText(e, 500);
		if (e instanceof GitHubError && e.status >= 400 && e.status < 500)
			await noteToken(installationId, text);
		return text;
	}
}

export { GitHubError };
const HEADERS = { accept: 'application/vnd.github+json', 'x-github-api-version': '2022-11-28' };

let key: string | null = null;
export function privateKey(): string {
	if (key) return key;
	if (GITHUB_APP_PRIVATE_KEY) key = GITHUB_APP_PRIVATE_KEY.replace(/\\n/g, '\n');
	else if (GITHUB_APP_PRIVATE_KEY_PATH) key = readFileSync(GITHUB_APP_PRIVATE_KEY_PATH, 'utf8');
	else throw new Error('Set GITHUB_APP_PRIVATE_KEY or GITHUB_APP_PRIVATE_KEY_PATH');
	return key;
}

/** Reads for one installation, as the App. */
export function installationClient(installationId: number): GitHubClient {
	return tokenClient(async () => {
		try {
			const token = await tokenFor(GITHUB_APP_ID, privateKey(), installationId);
			return token;
		} catch (e) {
			// 401, 403 or 404: the App's key is wrong, or the installation is gone or suspended.
			if (e instanceof GitHubError && e.status >= 400 && e.status < 500)
				await noteToken(installationId, errorText(e, 500));
			throw e;
		}
	}, `installation:${installationId}`);
}

export function asApp(): GitHubClient {
	return appClient(GITHUB_APP_ID, privateKey());
}

async function json<T>(res: Response): Promise<T> {
	if (!res.ok) throw new GitHubError(res.status, `GitHub ${res.status}: ${await res.text()}`);
	return (await res.json()) as T;
}

// The user side: the App's OAuth flow, which signs people in and gives a token that acts as them.

export function authorizeUrl(redirectUri: string, state: string): string {
	const u = new URL('https://github.com/login/oauth/authorize');
	u.searchParams.set('client_id', GITHUB_CLIENT_ID);
	u.searchParams.set('redirect_uri', redirectUri);
	u.searchParams.set('state', state);
	return u.toString();
}

export interface UserTokens {
	accessToken: string;
	accessExpiresAt: Date | null;
	refreshToken: string | null;
	refreshExpiresAt: Date | null;
}

async function tokenRequest(params: Record<string, string>): Promise<UserTokens> {
	const res = await fetch('https://github.com/login/oauth/access_token', {
		method: 'POST',
		headers: { accept: 'application/json', 'content-type': 'application/json' },
		body: JSON.stringify({
			client_id: GITHUB_CLIENT_ID,
			client_secret: GITHUB_CLIENT_SECRET,
			...params
		})
	});
	const t = await json<{
		access_token?: string;
		expires_in?: number;
		refresh_token?: string;
		refresh_token_expires_in?: number;
		error?: string;
		error_description?: string;
	}>(res);
	if (!t.access_token)
		throw new GitHubError(400, t.error_description ?? t.error ?? 'no access token');
	const at = (s?: number) => (s ? new Date(Date.now() + s * 1000) : null);
	return {
		accessToken: t.access_token,
		accessExpiresAt: at(t.expires_in),
		refreshToken: t.refresh_token ?? null,
		refreshExpiresAt: at(t.refresh_token_expires_in)
	};
}

export function exchangeCode(code: string, redirectUri: string): Promise<UserTokens> {
	return tokenRequest({ code, redirect_uri: redirectUri });
}

export function refreshUserToken(refreshToken: string): Promise<UserTokens> {
	return tokenRequest({ grant_type: 'refresh_token', refresh_token: refreshToken });
}

export interface GitHubUser {
	id: number;
	login: string;
	name: string | null;
}

export async function currentUser(accessToken: string): Promise<GitHubUser> {
	const res = await fetch(`${API}/user`, {
		headers: { ...HEADERS, authorization: `Bearer ${accessToken}` }
	});
	return json<GitHubUser>(res);
}
