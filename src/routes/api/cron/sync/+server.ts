// The daily backstop (spec §7.4): re-sync everything, in case a webhook was missed, then the
// housekeeping (#lib/server/cron). Vercel Cron calls it with the project's CRON_SECRET as a bearer
// token.
import { CRON_SECRET } from '$app/env/private';
import { runCron } from '#lib/server/cron.ts';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const config = { maxDuration: 300 };

export const GET: RequestHandler = async ({ request }) => {
	if (!CRON_SECRET) return json({ error: 'CRON_SECRET is not set' }, { status: 503 });
	if (request.headers.get('authorization') !== `Bearer ${CRON_SECRET}`)
		return json({ error: 'unauthorised' }, { status: 401 });
	const r = await runCron('cron');
	// A run with a failed step answers 500, so Vercel's own cron log shows it too.
	return json(r, { status: r.ok ? 200 : 500 });
};
