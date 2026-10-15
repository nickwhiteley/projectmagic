// What the edit and add pages share: turning a write result into a page response.
import { fail, redirect } from '@sveltejs/kit';
import { diffLines } from '#lib/core/diff.ts';
import { ReauthRequired } from './user-token.ts';
import { WriteError, type WriteResult } from './write.ts';

export function respond<E extends object>(result: WriteResult, done: string, extra: E = {} as E) {
	switch (result.kind) {
		case 'merged':
		case 'unchanged':
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
	const to = typeof raw === 'string' ? raw : '';
	return /^\/(?![/\\])/.test(to) ? to : fallback;
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
