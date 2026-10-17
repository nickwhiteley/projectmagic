// Takes a submission from the feedback dialog, which can be opened from any page (PM35).
import { readFeedback } from '#lib/core/feedback.ts';
import { submitFeedback } from '#lib/server/feedback.ts';
import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ locals, request }) => {
	if (!locals.user) error(401, 'Sign in to send feedback.');
	const f = readFeedback(await request.json().catch(() => ({})));
	if ('error' in f) error(400, f.error);
	const r = await submitFeedback(locals.user.id, locals.tenant?.id ?? null, f);
	if (!r.ok) error(429, r.reason);
	return json({ sent: true });
};
