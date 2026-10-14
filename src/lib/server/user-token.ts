// Acting as the signed-in user (spec §11.1): their refresh token, stored encrypted, buys a
// short-lived access token for their writes, so commits are attributed to them and GitHub
// decides what they may do. GitHub rotates the refresh token on every use.
import { TOKEN_ENCRYPTION_KEY } from '$app/env/private';
import { decrypt, encrypt } from './crypto.ts';
import { db } from './db.ts';
import { refreshUserToken } from './github-app.ts';
import { tokenClient, type GitHubClient } from './github-client.ts';

export class ReauthRequired extends Error {
	constructor() {
		super('Your GitHub sign-in has expired. Sign in again to edit.');
	}
}

const access = new Map<string, { token: string; expires: number }>();

async function accessToken(userId: string): Promise<string> {
	const hit = access.get(userId);
	if (hit && hit.expires - Date.now() > 5 * 60_000) return hit.token;
	return db().begin(async (tx) => {
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
		} catch {
			throw new ReauthRequired();
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
	});
}

export function userClient(userId: string): GitHubClient {
	return tokenClient(() => accessToken(userId));
}
