// The daily digest (PM39): what waits on a person across a tenant's projects, posted to the Slack
// incoming webhook a tenant admin set. Sent by the daily cron after the sync, at most once a day,
// and never when nothing waits. Before migration 015 the columns are missing, and there is no digest.
import { TOKEN_ENCRYPTION_KEY } from '$app/env/private';
import { founderQueue } from '#lib/core/delivery.ts';
import { digestMessage, type DigestItem } from '#lib/core/evidence.ts';
import { decrypt, encrypt } from './crypto.ts';
import { db } from './db.ts';
import { loadEvents } from './delivery.ts';
import { loadProjectState } from './project-state.ts';
import { allProjects } from './projects.ts';
import { errorText } from '#lib/core/ops.ts';
import { failed } from './ops.ts';

const missing = (e: unknown) => ['42P01', '42703'].includes((e as { code?: string })?.code ?? '');

/** Whether the tenant has a webhook set, and its last failure (PM54), or null before the migration. */
export async function slackDigest(tenantId: string): Promise<{
	connected: boolean;
	lastError: string | null;
	failedAt: string | null;
} | null> {
	let connected: boolean;
	try {
		const [r] = await db()<{ slack_webhook_enc: string | null }[]>`
			select slack_webhook_enc from tenant_setting where tenant_id = ${tenantId}`;
		connected = !!r?.slack_webhook_enc;
	} catch (e) {
		if (missing(e)) return null;
		throw e;
	}
	// The failure columns are migration 016's: without them, there is simply no failure to show.
	const [f] = await db()<{ digest_last_error: string | null; digest_failed_at: Date | null }[]>`
		select digest_last_error, digest_failed_at from tenant_setting where tenant_id = ${tenantId}`.catch(
		() => []
	);
	return {
		connected,
		lastError: f?.digest_last_error ?? null,
		failedAt: f?.digest_failed_at?.toISOString() ?? null
	};
}

/** Sets the webhook (encrypted) and the origin for links, or removes it with null. */
export async function setSlackWebhook(
	tenantId: string,
	actorId: string,
	url: string | null,
	origin: string
): Promise<void> {
	const sealed = url ? encrypt(url.trim(), TOKEN_ENCRYPTION_KEY) : null;
	await db().begin(async (tx) => {
		await tx`insert into tenant_setting (tenant_id, slack_webhook_enc, digest_origin)
			values (${tenantId}, ${sealed}, ${origin})
			on conflict (tenant_id) do update set slack_webhook_enc = excluded.slack_webhook_enc,
				digest_origin = excluded.digest_origin`;
		await tx`insert into audit_log (tenant_id, actor_user_id, action, target, data_json)
			values (${tenantId}, ${actorId}, ${url ? 'tenant.slack.set' : 'tenant.slack.removed'},
				${`tenant:${tenantId}`}, ${tx.json({})})`;
	});
}

/** What waits on a person in each of the tenant's projects, oldest first. */
export async function digestFor(tenantId: string, origin: string, now = Date.now()) {
	const projects = [];
	for (const p of await allProjects(tenantId)) {
		const s = await loadProjectState(p.id);
		if (!s.hasBacklog) continue;
		const { changes } = await loadEvents(p.id).catch(() => ({ changes: [] }));
		const url = `${origin}/p/${p.param}`;
		const itemUrl = (id: string) => `${url}/i/${encodeURIComponent(id)}`;
		const replies: DigestItem[] = s.items
			.filter((i) => i.reply)
			.map((i) => ({
				id: i.id,
				title: i.titleText,
				kind: 'reply',
				waiting: null,
				days: null,
				url: itemUrl(i.id)
			}));
		const queue: DigestItem[] = founderQueue(
			s.items
				.filter((i) => !i.reply)
				.map((i) => ({
					id: i.id,
					title: i.titleText,
					status: i.status,
					waiting: i.waiting,
					assignee: i.assignee
				})),
			changes,
			now
		).map((f) => ({
			id: f.id,
			title: f.title,
			kind: f.status === 'built' ? 'built' : 'blocked',
			waiting: f.waiting,
			days: f.days,
			url: itemUrl(f.id)
		}));
		projects.push({ name: s.name, url, items: [...replies, ...queue] });
	}
	return digestMessage(projects);
}

/** Posts to a Slack incoming webhook; the alerts (PM55) use it too. */
export async function post(webhook: string, message: { text: string }): Promise<void> {
	const res = await fetch(webhook, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(message),
		signal: AbortSignal.timeout(10_000)
	});
	if (!res.ok) throw new Error(`Slack said ${res.status}: ${(await res.text()).slice(0, 200)}`);
}

/** Sends one tenant's digest now (the settings page's *Send now*). False when nothing waits. */
export async function sendDigestNow(tenantId: string, origin: string): Promise<boolean> {
	const [r] = await db()<{ slack_webhook_enc: string | null }[]>`
		select slack_webhook_enc from tenant_setting where tenant_id = ${tenantId}`;
	if (!r?.slack_webhook_enc) throw new Error('No Slack webhook is set.');
	const message = await digestFor(tenantId, origin);
	if (!message) return false;
	try {
		await post(decrypt(r.slack_webhook_enc, TOKEN_ENCRYPTION_KEY), message);
	} catch (e) {
		await digestFailed(tenantId, e);
		throw e;
	}
	await digestOk(tenantId);
	return true;
}

/** Sends a tenant's digest again with the origin its admin set, from the Operations tab (PM51). */
export async function resendDigest(tenantId: string): Promise<boolean> {
	const [r] = await db()<{ digest_origin: string | null }[]>`
		select digest_origin from tenant_setting where tenant_id = ${tenantId}`;
	if (!r?.digest_origin) throw new Error('The tenant has no digest set up.');
	return sendDigestNow(tenantId, r.digest_origin);
}

/** A digest Slack refused, kept for the tenant's settings and the Operations tab (PM54). */
async function digestFailed(tenantId: string, e: unknown): Promise<void> {
	await failed('digest', { tenantId }, e);
	await db()`update tenant_setting set digest_last_error = ${errorText(e, 500)}, digest_failed_at = now()
		where tenant_id = ${tenantId}`.catch(() => {});
}

async function digestOk(tenantId: string): Promise<void> {
	await db()`update tenant_setting set digest_last_error = null, digest_failed_at = null
		where tenant_id = ${tenantId} and digest_last_error is not null`.catch(() => {});
}

/** The daily cron: every active tenant with a webhook that hasn't had today's digest. */
export async function sendDigests(): Promise<{ sent: number; failed: number }> {
	let rows: { tenant_id: string; slack_webhook_enc: string; digest_origin: string | null }[];
	try {
		rows = await db()`
			select s.tenant_id, s.slack_webhook_enc, s.digest_origin from tenant_setting s
			join tenant t on t.id = s.tenant_id
			where s.slack_webhook_enc is not null and t.status = 'active'
			and (s.digest_sent_on is null or s.digest_sent_on < current_date)`;
	} catch (e) {
		if (missing(e)) return { sent: 0, failed: 0 };
		throw e;
	}
	let sent = 0;
	let bad = 0;
	for (const r of rows) {
		try {
			if (!r.digest_origin) continue;
			const message = await digestFor(String(r.tenant_id), r.digest_origin);
			if (message) await post(decrypt(r.slack_webhook_enc, TOKEN_ENCRYPTION_KEY), message);
			await db()`update tenant_setting set digest_sent_on = current_date
				where tenant_id = ${r.tenant_id}`;
			if (message) sent++;
			await digestOk(String(r.tenant_id));
		} catch (e) {
			bad++;
			await digestFailed(String(r.tenant_id), e);
		}
	}
	return { sent, failed: bad };
}
