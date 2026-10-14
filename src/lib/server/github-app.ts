// The GitHub App's own credentials (spec §11): a JWT signed with its private key, exchanged for
// installation tokens, which every read uses. Writes use the acting user's token instead.
import {
	GITHUB_APP_ID,
	GITHUB_APP_PRIVATE_KEY,
	GITHUB_APP_PRIVATE_KEY_PATH,
	GITHUB_CLIENT_ID,
	GITHUB_CLIENT_SECRET
} from '$app/env/private';
import { createSign } from 'node:crypto';
import { readFileSync } from 'node:fs';

export const API = 'https://api.github.com';
const HEADERS = { accept: 'application/vnd.github+json', 'x-github-api-version': '2022-11-28' };

let key: string | null = null;
function privateKey(): string {
	if (key) return key;
	if (GITHUB_APP_PRIVATE_KEY) key = GITHUB_APP_PRIVATE_KEY.replace(/\\n/g, '\n');
	else if (GITHUB_APP_PRIVATE_KEY_PATH) key = readFileSync(GITHUB_APP_PRIVATE_KEY_PATH, 'utf8');
	else throw new Error('Set GITHUB_APP_PRIVATE_KEY or GITHUB_APP_PRIVATE_KEY_PATH');
	return key;
}

/** A JWT for the App itself, valid for nine minutes (GitHub allows ten), backdated for clock skew. */
export function appJwt(now = Date.now()): string {
	const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
	const iat = Math.floor(now / 1000) - 60;
	const body = `${b64({ alg: 'RS256', typ: 'JWT' })}.${b64({ iat, exp: iat + 600, iss: GITHUB_APP_ID })}`;
	return `${body}.${createSign('RSA-SHA256').update(body).sign(privateKey(), 'base64url')}`;
}

export class GitHubError extends Error {
	constructor(
		readonly status: number,
		message: string
	) {
		super(message);
	}
}

async function json<T>(res: Response): Promise<T> {
	if (!res.ok) throw new GitHubError(res.status, `GitHub ${res.status}: ${await res.text()}`);
	return (await res.json()) as T;
}

const cache = new Map<number, { token: string; expires: number }>();

/** An installation token, reused until five minutes before it expires. */
export async function installationToken(installationId: number): Promise<string> {
	const hit = cache.get(installationId);
	if (hit && hit.expires - Date.now() > 5 * 60_000) return hit.token;
	const res = await fetch(`${API}/app/installations/${installationId}/access_tokens`, {
		method: 'POST',
		headers: { ...HEADERS, authorization: `Bearer ${appJwt()}` }
	});
	const t = await json<{ token: string; expires_at: string }>(res);
	cache.set(installationId, { token: t.token, expires: Date.parse(t.expires_at) });
	return t.token;
}

export interface Installation {
	id: number;
	account: { login: string };
}

export async function installations(): Promise<Installation[]> {
	const res = await fetch(`${API}/app/installations?per_page=100`, {
		headers: { ...HEADERS, authorization: `Bearer ${appJwt()}` }
	});
	return json<Installation[]>(res);
}

export interface InstalledRepo {
	id: number;
	name: string;
	full_name: string;
	owner: { login: string };
	default_branch: string;
	archived: boolean;
}

export async function installationRepos(installationId: number): Promise<InstalledRepo[]> {
	const token = await installationToken(installationId);
	const repos: InstalledRepo[] = [];
	for (let page = 1; ; page++) {
		const res = await fetch(`${API}/installation/repositories?per_page=100&page=${page}`, {
			headers: { ...HEADERS, authorization: `token ${token}` }
		});
		const body = await json<{ repositories: InstalledRepo[]; total_count: number }>(res);
		repos.push(...body.repositories);
		if (repos.length >= body.total_count || !body.repositories.length) return repos;
	}
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
