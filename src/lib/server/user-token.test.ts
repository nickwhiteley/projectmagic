// Acting as a person whose access token GitHub refuses: one fresh token is tried, then a new sign-in.
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('$app/env/private', () => ({ TOKEN_ENCRYPTION_KEY: 'k' }));
vi.mock('./crypto.ts', () => ({ decrypt: (s: string) => s, encrypt: (s: string) => s }));
let n = 0;
vi.mock('./github-app.ts', () => ({
	refreshUserToken: async () => ({
		accessToken: `a${++n}`,
		accessExpiresAt: new Date(Date.now() + 8 * 3_600_000),
		refreshToken: `r${n}`,
		refreshExpiresAt: null
	})
}));
// Tagged-template calls resolve to one stored row; begin() runs its callback with the same.
const sql = Object.assign(
	() => Promise.resolve([{ refresh_token_enc: 'r0', refresh_token_expires_at: null }]),
	{ begin: (fn: (tx: unknown) => unknown) => Promise.resolve(fn(sql)) }
);
vi.mock('./db.ts', () => ({ db: () => sql }));

const { userClient, ReauthRequired } = await import('./user-token.ts');

/** GitHub accepting only the tokens named. */
function github(accepted: string[]) {
	const seen: string[] = [];
	vi.stubGlobal(
		'fetch',
		vi.fn(async (_url: string, init: RequestInit) => {
			const token = String((init.headers as Record<string, string>).authorization).split(' ')[1];
			seen.push(token);
			return accepted.includes(token)
				? new Response('{"installations":[{"id":7}]}', { status: 200 })
				: new Response('{"message":"Bad credentials"}', { status: 401 });
		})
	);
	return seen;
}

afterEach(() => vi.unstubAllGlobals());

describe('userClient', () => {
	it('tries a fresh token once when GitHub refuses the cached one', async () => {
		const seen = github(['a2']);
		const r = await userClient('u1').rest<{ installations: { id: number }[] }>(
			'/user/installations'
		);
		expect(r.body.installations[0].id).toBe(7);
		expect(seen).toEqual(['a1', 'a2']);
	});

	it('does the same for send, which returns a 401 rather than throwing', async () => {
		const seen = github(['a4']);
		const r = await userClient('u2').send('GET', '/user/memberships/orgs/acme');
		expect(r.status).toBe(200);
		expect(seen).toEqual(['a3', 'a4']);
	});

	it('asks for a new sign-in when the fresh token is refused too', async () => {
		const seen = github([]);
		await expect(userClient('u3').rest('/user/installations')).rejects.toBeInstanceOf(
			ReauthRequired
		);
		expect(seen).toHaveLength(2);
	});
});
