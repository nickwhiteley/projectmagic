// A small GitHub client with no SvelteKit imports, so the sync can run from a script too.
// Authentication is passed in: an installation token for reads (spec §11.1).
import { createSign } from 'node:crypto';
import { parseRateLimit, retryDelay, type RateLimit } from '#lib/core/ops.ts';

export const API = 'https://api.github.com';
const HEADERS = { accept: 'application/vnd.github+json', 'x-github-api-version': '2022-11-28' };
/** No call waits longer than this (PM53): a hung call would hold the project's sync claim. */
export const TIMEOUT_MS = 30_000;

/** Told of every response's rate-limit headers, with the client's scope (PM53). The app records
 * them; a script leaves it unset. */
let observer: ((scope: string, limit: RateLimit) => void) | null = null;
export function observeRateLimits(fn: typeof observer): void {
	observer = fn;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * One request, with a timeout, and retried when GitHub drops it: a 5xx, a network failure, or a
 * secondary limit with a short `retry-after`. Only requests that change nothing are retried.
 */
async function call(url: string, init: RequestInit, scope: string | null): Promise<Response> {
	const idempotent = !init.method || init.method === 'GET' || url.endsWith('/graphql');
	for (let attempt = 0; ; attempt++) {
		let res: Response | null = null;
		let failure: unknown = null;
		try {
			res = await fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
		} catch (e) {
			failure = e;
		}
		if (res && scope && observer) {
			const limit = parseRateLimit((n) => res!.headers.get(n));
			if (limit) observer(scope, limit);
		}
		const wait = retryDelay({
			status: res?.status ?? 0,
			attempt,
			idempotent,
			retryAfter: res?.headers.get('retry-after'),
			remaining: res?.headers.get('x-ratelimit-remaining')
		});
		if (wait === null || (res && res.ok)) {
			if (res) return res;
			const name = (failure as Error)?.name;
			throw new GitHubError(
				0,
				name === 'TimeoutError' || name === 'AbortError'
					? `GitHub timed out after ${TIMEOUT_MS / 1000} s: ${init.method ?? 'GET'} ${url.replace(API, '')}`
					: `GitHub unreachable: ${(failure as Error)?.message ?? failure}`
			);
		}
		await res?.body?.cancel().catch(() => {});
		await sleep(wait);
	}
}

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
	/** Any REST request. A 4xx comes back as a status, not an exception, so callers can act on it. */
	send<T>(method: string, path: string, body?: unknown): Promise<{ status: number; body: T }>;
}

/** GitHub reports a missing `file(path:)` or `object(oid:)` as a NOT_FOUND error beside the data
 * (spike 0.1). Those, at an aliased field, mean "absent"; anything else is fatal. */
const absent = (e: { type?: string; path?: (string | number)[] }) =>
	e.type === 'NOT_FOUND' && /^[a-z]\d+$/.test(String(e.path?.at(-1) ?? ''));

/** A client for a token. `scope` names it for the rate-limit budget: `installation:<id>` or
 * `user:<id>`. */
export function tokenClient(
	token: () => Promise<string>,
	scope: string | null = null
): GitHubClient {
	return {
		async graphql<T>(query: string, variables: Record<string, unknown> = {}) {
			const res = await call(
				`${API}/graphql`,
				{
					method: 'POST',
					headers: { ...HEADERS, authorization: `bearer ${await token()}` },
					body: JSON.stringify({ query, variables })
				},
				scope
			);
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
		async send<T>(method: string, path: string, body?: unknown) {
			const res = await call(
				`${API}${path}`,
				{
					method,
					headers: {
						...HEADERS,
						authorization: `token ${await token()}`,
						'content-type': 'application/json'
					},
					body: body === undefined ? undefined : JSON.stringify(body)
				},
				scope
			);
			if (res.status >= 500)
				throw new GitHubError(
					res.status,
					`GitHub ${res.status} ${method} ${path}: ${await res.text()}`
				);
			const text = await res.text();
			return { status: res.status, body: (text ? JSON.parse(text) : null) as T };
		},
		async rest<T>(path: string) {
			const url = path.startsWith('https://') ? path : `${API}${path}`;
			const res = await call(
				url,
				{ headers: { ...HEADERS, authorization: `token ${await token()}` } },
				scope
			);
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
export async function installationToken(
	appId: string,
	privateKey: string,
	installationId: number,
	/** Ask GitHub even if a token is cached (the Operations tab's check). */
	fresh = false
) {
	const hit = tokens.get(installationId);
	if (!fresh && hit && hit.expires - Date.now() > 5 * 60_000) return hit.token;
	const res = await call(
		`${API}/app/installations/${installationId}/access_tokens`,
		{
			method: 'POST',
			headers: { ...HEADERS, authorization: `Bearer ${appJwt(appId, privateKey)}` }
		},
		null
	);
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
		send: c.send,
		async rest<T>(path: string) {
			const url = path.startsWith('https://') ? path : `${API}${path}`;
			const res = await call(
				url,
				{ headers: { ...HEADERS, authorization: `Bearer ${appJwt(appId, privateKey)}` } },
				'app'
			);
			if (!res.ok)
				throw new GitHubError(res.status, `GitHub ${res.status} ${path}: ${await res.text()}`);
			const next = res.headers.get('link')?.match(/<([^>]+)>;\s*rel="next"/)?.[1] ?? null;
			return { body: (await res.json()) as T, next };
		}
	};
}
