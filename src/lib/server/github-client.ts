// A small GitHub client with no SvelteKit imports, so the sync can run from a script too.
// Authentication is passed in: an installation token for reads (spec §11.1).
import { createSign } from 'node:crypto';

export const API = 'https://api.github.com';
const HEADERS = { accept: 'application/vnd.github+json', 'x-github-api-version': '2022-11-28' };

export class GitHubError extends Error {
	readonly status: number;
	constructor(status: number, message: string) {
		super(message);
		this.status = status;
	}
}

export interface GitHubClient {
	graphql<T>(query: string, variables?: Record<string, unknown>): Promise<T>;
	/** A REST GET, with the response's Link header for paging. */
	rest<T>(path: string): Promise<{ body: T; next: string | null }>;
}

/** GitHub reports a missing `file(path:)` or `object(oid:)` as a NOT_FOUND error beside the data
 * (spike 0.1). Those, at an aliased field, mean "absent"; anything else is fatal. */
const absent = (e: { type?: string; path?: (string | number)[] }) =>
	e.type === 'NOT_FOUND' && /^[a-z]\d+$/.test(String(e.path?.at(-1) ?? ''));

export function tokenClient(token: () => Promise<string>): GitHubClient {
	return {
		async graphql<T>(query: string, variables: Record<string, unknown> = {}) {
			const res = await fetch(`${API}/graphql`, {
				method: 'POST',
				headers: { ...HEADERS, authorization: `bearer ${await token()}` },
				body: JSON.stringify({ query, variables })
			});
			if (!res.ok) throw new GitHubError(res.status, `GraphQL ${res.status}: ${await res.text()}`);
			const body = (await res.json()) as {
				data?: T;
				errors?: { type?: string; path?: string[]; message: string }[];
			};
			const fatal = (body.errors ?? []).filter((e) => !absent(e));
			if (fatal.length || !body.data)
				throw new GitHubError(
					200,
					`GraphQL: ${fatal.map((e) => e.message).join('; ') || 'no data'}`
				);
			return body.data;
		},
		async rest<T>(path: string) {
			const url = path.startsWith('https://') ? path : `${API}${path}`;
			const res = await fetch(url, {
				headers: { ...HEADERS, authorization: `token ${await token()}` }
			});
			if (!res.ok)
				throw new GitHubError(res.status, `GitHub ${res.status} ${path}: ${await res.text()}`);
			const next = res.headers.get('link')?.match(/<([^>]+)>;\s*rel="next"/)?.[1] ?? null;
			return { body: (await res.json()) as T, next };
		}
	};
}

/** A JWT for the App itself, valid for nine minutes (GitHub allows ten), backdated for clock skew. */
export function appJwt(appId: string, privateKey: string, now = Date.now()): string {
	const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
	const iat = Math.floor(now / 1000) - 60;
	const body = `${b64({ alg: 'RS256', typ: 'JWT' })}.${b64({ iat, exp: iat + 600, iss: appId })}`;
	return `${body}.${createSign('RSA-SHA256').update(body).sign(privateKey, 'base64url')}`;
}

const tokens = new Map<number, { token: string; expires: number }>();

/** An installation token, reused until five minutes before it expires. */
export async function installationToken(appId: string, privateKey: string, installationId: number) {
	const hit = tokens.get(installationId);
	if (hit && hit.expires - Date.now() > 5 * 60_000) return hit.token;
	const res = await fetch(`${API}/app/installations/${installationId}/access_tokens`, {
		method: 'POST',
		headers: { ...HEADERS, authorization: `Bearer ${appJwt(appId, privateKey)}` }
	});
	if (!res.ok) throw new GitHubError(res.status, `GitHub ${res.status}: ${await res.text()}`);
	const t = (await res.json()) as { token: string; expires_at: string };
	tokens.set(installationId, { token: t.token, expires: Date.parse(t.expires_at) });
	return t.token;
}

/** A client that acts as the App itself (JWT), for listing installations. */
export function appClient(appId: string, privateKey: string): GitHubClient {
	const c = tokenClient(async () => appJwt(appId, privateKey));
	return {
		graphql: c.graphql,
		async rest<T>(path: string) {
			const url = path.startsWith('https://') ? path : `${API}${path}`;
			const res = await fetch(url, {
				headers: { ...HEADERS, authorization: `Bearer ${appJwt(appId, privateKey)}` }
			});
			if (!res.ok)
				throw new GitHubError(res.status, `GitHub ${res.status} ${path}: ${await res.text()}`);
			const next = res.headers.get('link')?.match(/<([^>]+)>;\s*rel="next"/)?.[1] ?? null;
			return { body: (await res.json()) as T, next };
		}
	};
}
