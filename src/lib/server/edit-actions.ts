// What the edit and add pages share: turning a write result into a page response.
import { fail, redirect } from '@sveltejs/kit';
import { diffLines } from '#lib/core/diff.ts';
import { ReauthRequired } from './user-token.ts';
import type { EditResult } from './edits.ts';
import { WriteError } from './write.ts';

export function respond<E extends object>(result: EditResult, done: string, extra: E = {} as E) {
	switch (result.kind) {
		case 'merged':
		case 'unchanged':
		case 'queued':
			return redirect(303, done);
		case 'pending':
			return redirect(303, `${done}${done.includes('?') ? '&' : '?'}pending=1`);
		case 'conflict':
			return fail(409, {
				...extra,
				message: 'The backlog changed on main while you were looking. Reload and try again.',
				reauth: false
			});
		case 'blocked':
		case 'refused':
			return fail(result.kind === 'refused' ? 403 : 409, {
				...extra,
				message: result.detail,
				reauth: false
			});
	}
}

/** Where a form asked to go back to: a path on this site, never another site. */
export function safeBack(raw: FormDataEntryValue | null, fallback: string): string {
	return localPath(typeof raw === 'string' ? raw : '') ?? fallback;
}

/**
 * A path on this site, or null. Browsers drop tabs and newlines from a URL and read `\` as `/`,
 * so `/\t/evil.example` would leave the site: no control characters or spaces at all, and the
 * path must resolve to this origin.
 */
export function localPath(to: string): string | null {
	if (!/^\/(?![/\\])/.test(to) || /[\s\x00-\x1f\x7f]/.test(to)) return null;
	const base = 'http://local.invalid';
	try {
		return new URL(to, base).origin === base ? to : null;
	} catch {
		return null;
	}
}

/** Errors a person can act on become messages; anything else is a bug and is thrown. */
export function asMessage<E extends object>(e: unknown, extra: E = {} as E) {
	if (e instanceof ReauthRequired) return fail(401, { ...extra, message: e.message, reauth: true });
	if (e instanceof WriteError) return fail(400, { ...extra, message: e.message, reauth: false });
	throw e;
}

/** For the conflict view: what changed on main since the form was opened, and what this edit does. */
export function conflictDiffs(base: string, theirs: string | null, mine: string) {
	return {
		theirs: theirs === null ? null : diffLines(base, theirs),
		mine: diffLines(theirs ?? base, mine)
	};
}
