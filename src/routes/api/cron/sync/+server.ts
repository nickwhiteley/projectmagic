// The daily backstop (spec §7.4): re-sync everything, in case a webhook was missed. Vercel Cron
// calls it with the project's CRON_SECRET as a bearer token.
import { CRON_SECRET } from '$app/env/private';
import { db } from '#lib/server/db.ts';
import { edits } from '#lib/server/edits.ts';
import { allProjects } from '#lib/server/projects.ts';
import { syncAll } from '#lib/server/sync-runner.ts';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const config = { maxDuration: 300 };

export const GET: RequestHandler = async ({ request }) => {
	if (!CRON_SECRET) return json({ error: 'CRON_SECRET is not set' }, { status: 503 });
	if (request.headers.get('authorization') !== `Bearer ${CRON_SECRET}`)
		return json({ error: 'unauthorised' }, { status: 401 });
	const result = await syncAll();
	// The backstop for batch edits (PM25): saves any that page loads and webhooks didn't.
	const held = await db()<
		{ project_id: string }[]
	>`select distinct project_id from pending_edit`.catch(() => []);
	for (const p of await allProjects())
		if (held.some((h) => String(h.project_id) === p.id)) await edits.savePendingIfDue(p);
	await db()`delete from blob_text where fetched_at < now() - interval '14 days'`.catch(() => []);
	await db()`delete from webhook_delivery where received_at < now() - interval '14 days'`;
	return json({ ok: true, result });
};
