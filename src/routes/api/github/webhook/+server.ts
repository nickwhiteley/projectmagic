// GitHub's webhook (spec §7.4): verify, deduplicate by delivery, and start a sync in the
// background. The payload says which repository, and the project says which tenant; everything
// else is fetched by the sync. A delivery for a project whose tenant isn't active is recorded and
// acknowledged, and starts no sync (specs/tenants.md §5). Each delivery records what came of it
// (PM52), and one refused for its signature is counted, as that is usually a mismatched secret.
import { GITHUB_WEBHOOK_SECRET } from '$app/env/private';
import { db } from '#lib/server/db.ts';
import { edits } from '#lib/server/edits.ts';
import { recordInstallationEvent } from '#lib/server/installations.ts';
import { failed } from '#lib/server/ops.ts';
import { projectByGitHubId } from '#lib/server/projects.ts';
import { syncInBackground, syncProjectList } from '#lib/server/sync-runner.ts';
import { INSTALLATION_EVENTS, PROJECT_EVENTS, verifySignature } from '#lib/server/webhook.ts';
import { waitUntil } from '@vercel/functions';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request }) => {
	const t0 = Date.now();
	const body = await request.text();
	const event = request.headers.get('x-github-event') ?? '';
	const delivery = request.headers.get('x-github-delivery') ?? '';
	if (!verifySignature(GITHUB_WEBHOOK_SECRET, body, request.headers.get('x-hub-signature-256'))) {
		await failed('webhook signature', {}, 'The signature doesn’t match GITHUB_WEBHOOK_SECRET', {
			event,
			delivery
		});
		return json({ error: 'bad signature' }, { status: 401 });
	}

	let payload: { repository?: { id: number } };
	try {
		payload = JSON.parse(body);
	} catch (e) {
		await failed('webhook', {}, e, { event, delivery, step: 'parse' });
		return json({ error: 'body is not JSON' }, { status: 400 });
	}
	const project = payload.repository ? await projectByGitHubId(payload.repository.id) : null;

	const [fresh] = await db()`
		insert into webhook_delivery (delivery_id, project_id, event) values (${delivery}, ${project?.id ?? null}, ${event})
		on conflict (delivery_id) do nothing returning delivery_id`;
	if (!fresh) return json({ ok: true, duplicate: true });
	/** What came of it (PM52); before migration 016 the columns aren't there. */
	const outcome = (o: string, detail: string | null = null) =>
		db()`update webhook_delivery set outcome = ${o}, detail = ${detail}, ms = ${Date.now() - t0}
			where delivery_id = ${delivery}`.catch(() => {});

	if (INSTALLATION_EVENTS.has(event)) {
		// Record the installation, and who installed it, before any redirect can claim it.
		if (event === 'installation')
			await recordInstallationEvent(
				payload as unknown as Parameters<typeof recordInstallationEvent>[0]
			);
		// If the work fails, the delivery is forgotten, so GitHub's Redeliver can run it again.
		waitUntil(
			syncProjectList().catch(async (e) => {
				await failed('webhook', {}, e, { event, delivery, step: 'project list' });
				await db()`delete from webhook_delivery where delivery_id = ${delivery}`;
			})
		);
		await outcome('projects listed');
		return json({ ok: true, sync: 'projects' }, { status: 202 });
	}
	if (PROJECT_EVENTS.has(event) && !project) {
		await outcome('ignored', 'no project for this repository');
		return json({ ok: true, ignored: 'no project' });
	}
	// A repository over the tenant's plan is not synced (specs/tenants.md §7.2).
	if (PROJECT_EVENTS.has(event) && project && !project.overLimit) {
		const [tenant] = await db()<{ status: string }[]>`
			select status from tenant where id = ${project.tenantId}`;
		if (tenant?.status !== 'active') {
			await outcome('ignored', 'tenant is not active');
			return json({ ok: true, ignored: 'tenant is not active' });
		}
		await db()`update project set last_webhook_at = now() where id = ${project.id}`;
		syncInBackground(project.id, 'webhook');
		// A batch of pending edits that is due is saved on any webhook for the project (PM25).
		waitUntil(edits.savePendingIfDue(project));
		await outcome('sync started');
		return json({ ok: true, sync: project.repo }, { status: 202 });
	}
	await outcome(
		'ignored',
		project?.overLimit ? 'project is over the plan’s limit' : `event ${event}`
	);
	return json({ ok: true, ignored: event });
};
