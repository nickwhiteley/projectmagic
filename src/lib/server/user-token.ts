// Acting as the signed-in user (spec §11.1): their refresh token, stored encrypted, buys a
// short-lived access token for their writes, so commits are attributed to them and GitHub
// decides what they may do. GitHub rotates the refresh token on every use.
import { TOKEN_ENCRYPTION_KEY } from '$app/env/private';
import { decrypt, encrypt } from './crypto.ts';
import { db } from './db.ts';
import { refreshUserToken } from './github-app.ts';
import { GitHubError, tokenClient, type GitHubClient } from './github-client.ts';
import { errorText } from '#lib/core/ops.ts';

export class ReauthRequired extends Error {
	constructor() {
		super('Your GitHub sign-in has expired. Sign in again to edit.');
	}
}

const access = new Map<string, { token: string; expires: number }>();

/** GitHub refused the refresh token itself: only a new sign-in mends that. */
class RefreshRefused extends Error {}

/** Why a person's sign-in can't be refreshed (PM54), for the Operations tab; cleared when it can. */
async function noteRefresh(userId: string, error: string | null): Promise<void> {
	await db()`update app_user set refresh_error = ${error}, refresh_error_at = ${error ? new Date() : null}
		where id = ${userId} and refresh_error is distinct from ${error}`.catch(() => {});
}

async function accessToken(userId: string): Promise<string> {
	try {
		const token = await refreshed(userId);
		return token;
	} catch (e) {
		if (e instanceof RefreshRefused) {
			await noteRefresh(userId, e.message);
			throw new ReauthRequired();
		}
		throw e;
	}
}

async function refreshed(userId: string): Promise<string> {
	const hit = access.get(userId);
	if (hit && hit.expires - Date.now() > 5 * 60_000) return hit.token;
	return db()
		.begin(async (tx) => {
			// Locked, so two edits at once don't both spend the same refresh token.
			const [row] = await tx<
				{ refresh_token_enc: string | null; refresh_token_expires_at: Date | null }[]
			>`
			select refresh_token_enc, refresh_token_expires_at from app_user where id = ${userId} for update`;
			const again = access.get(userId);
			if (again && again.expires - Date.now() > 5 * 60_000) return again.token;
			if (
				!row?.refresh_token_enc ||
				(row.refresh_token_expires_at && row.refresh_token_expires_at < new Date())
			)
				throw new ReauthRequired();
			let t;
			try {
				t = await refreshUserToken(decrypt(row.refresh_token_enc, TOKEN_ENCRYPTION_KEY));
			} catch (e) {
				// GitHub refusing the token needs a new sign-in. A network error or GitHub being down
				// doesn't: it is thrown as itself, so the edit fails, is recorded, and is tried again.
				if (e instanceof GitHubError && e.status < 500) throw new RefreshRefused(errorText(e, 300));
				throw e;
			}
			await tx`update app_user set
			refresh_token_enc = ${t.refreshToken ? encrypt(t.refreshToken, TOKEN_ENCRYPTION_KEY) : row.refresh_token_enc},
			refresh_token_expires_at = ${t.refreshExpiresAt ?? row.refresh_token_expires_at}
			where id = ${userId}`;
			access.set(userId, {
				token: t.accessToken,
				expires: t.accessExpiresAt?.getTime() ?? Date.now() + 3_600_000
			});
			return t.accessToken;
		})
		.then(async (token) => {
			await noteRefresh(userId, null);
			return token;
		});
}

export function userClient(userId: string): GitHubClient {
	return tokenClient(() => accessToken(userId), `user:${userId}`);
}
