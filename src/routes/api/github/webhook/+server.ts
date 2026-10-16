// GitHub's webhook (spec §7.4): verify, deduplicate by delivery, and start a sync in the
// background. The payload says which repository; everything else is fetched by the sync.
import { GITHUB_WEBHOOK_SECRET } from '$app/env/private';
import { db } from '#lib/server/db.ts';
import { edits } from '#lib/server/edits.ts';
import { projectByGitHubId } from '#lib/server/projects.ts';
import { syncInBackground, syncProjectList } from '#lib/server/sync-runner.ts';
import { INSTALLATION_EVENTS, PROJECT_EVENTS, verifySignature } from '#lib/server/webhook.ts';
import { waitUntil } from '@vercel/functions';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request }) => {
	const body = await request.text();
	if (!verifySignature(GITHUB_WEBHOOK_SECRET, body, request.headers.get('x-hub-signature-256')))
		return json({ error: 'bad signature' }, { status: 401 });

	const event = request.headers.get('x-github-event') ?? '';
	const delivery = request.headers.get('x-github-delivery') ?? '';
	const payload = JSON.parse(body) as { repository?: { id: number } };
	const project = payload.repository ? await projectByGitHubId(payload.repository.id) : null;

	const [fresh] = await db()`
		insert into webhook_delivery (delivery_id, project_id, event) values (${delivery}, ${project?.id ?? null}, ${event})
		on conflict (delivery_id) do nothing returning delivery_id`;
	if (!fresh) return json({ ok: true, duplicate: true });

	if (INSTALLATION_EVENTS.has(event)) {
		// If the work fails, the delivery is forgotten, so GitHub's Redeliver can run it again.
		waitUntil(
			syncProjectList().catch(async (e) => {
				console.error('project list', e);
				await db()`delete from webhook_delivery where delivery_id = ${delivery}`;
			})
		);
		return json({ ok: true, sync: 'projects' }, { status: 202 });
	}
	if (PROJECT_EVENTS.has(event) && project) {
		await db()`update project set last_webhook_at = now() where id = ${project.id}`;
		syncInBackground(project.id);
		// A batch of pending edits that is due is saved on any webhook for the project (PM25).
		waitUntil(edits.savePendingIfDue(project));
		return json({ ok: true, sync: project.repo }, { status: 202 });
	}
	return json({ ok: true, ignored: event });
};
