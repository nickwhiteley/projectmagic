// The session: an HTTP-only, signed cookie carrying the user id (spec §11.1). The user is
// re-read on every request, so disabling them takes effect at once.
import type { Cookies } from '@sveltejs/kit';
import { sign, unsign } from './crypto.ts';

export const SESSION_COOKIE = 'pm_session';
export const SESSION_DAYS = 30;

export function readSession(
	cookie: string | undefined,
	secret: string,
	now = Date.now()
): string | null {
	if (!cookie) return null;
	const value = unsign(cookie, secret);
	if (!value) return null;
	const [userId, issued] = value.split(':');
	if (!userId || !issued) return null;
	if (now - Number(issued) * 1000 > SESSION_DAYS * 86_400_000) return null;
	return userId;
}

export function sessionValue(userId: string, secret: string, now = Date.now()): string {
	return sign(`${userId}:${Math.floor(now / 1000)}`, secret);
}

export function setSession(cookies: Cookies, userId: string, secret: string): void {
	cookies.set(SESSION_COOKIE, sessionValue(userId, secret), {
		path: '/',
		httpOnly: true,
		sameSite: 'lax',
		secure: true,
		maxAge: SESSION_DAYS * 86_400
	});
}

export function clearSession(cookies: Cookies): void {
	cookies.delete(SESSION_COOKIE, { path: '/' });
}
