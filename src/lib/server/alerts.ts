// Telling support when something breaks (PM55). A platform setting holds a Slack incoming webhook,
// kept encrypted like the tenants' digest webhooks. The check reads the same attention list as the
// Operations tab, and sends one message when a condition starts and one when it clears, never one
// per failure. It runs at the end of the cron (with a daily summary), and after a failure is
// recorded, at most every five minutes per instance.
import { TOKEN_ENCRYPTION_KEY } from '$app/env/private';
import { alertChanges, alertMessage, attention, errorText, summaryMessage } from '#lib/core/ops.ts';
import { waitUntil } from '@vercel/functions';
import { decrypt, encrypt } from './crypto.ts';
import { db } from './db.ts';
import { post } from './digest.ts';
import { log, missingSchema, setFailureHook } from './ops.ts';
import { snapshot } from './ops-view.ts';
import { audit } from './tenants.ts';

interface AlertConfig {
	webhookEnc: string | null;
	origin: string | null;
}

async function config(): Promise<AlertConfig> {
	const [r] = await db()<{ value_json: Partial<AlertConfig> }[]>`
		select value_json from platform_setting where key = 'alerts'`.catch(() => []);
	return { webhookEnc: r?.value_json.webhookEnc ?? null, origin: r?.value_json.origin ?? null };
}

/** Whether alerts are set up, for the settings page. Never the webhook itself. */
export async function alertSettings(): Promise<{ connected: boolean; origin: string | null }> {
	const c = await config();
	return { connected: !!c.webhookEnc, origin: c.origin };
}

export async function setAlertWebhook(
	url: string | null,
	origin: string,
	actorId: string
): Promise<void> {
	const value: AlertConfig = {
		webhookEnc: url ? encrypt(url.trim(), TOKEN_ENCRYPTION_KEY) : null,
		origin
	};
	await db()`
		insert into platform_setting (key, value_json, updated_by) values ('alerts', ${db().json(JSON.parse(JSON.stringify(value)))}, ${actorId})
		on conflict (key) do update set value_json = excluded.value_json, updated_by = excluded.updated_by, updated_at = now()`;
	await audit(
		null,
		actorId,
		url ? 'platform.alerts.set' : 'platform.alerts.removed',
		'platform_setting:alerts',
		{}
	);
}

/** Sends a test message, so an admin knows the webhook works. */
export async function testAlert(): Promise<void> {
	const c = await config();
	if (!c.webhookEnc) throw new Error('No alert webhook is set.');
	await post(decrypt(c.webhookEnc, TOKEN_ENCRYPTION_KEY), {
		text: `:wave: Project Magic alerts reach this channel. <${c.origin ?? ''}/admin/ops|Operations>`
	});
}

export interface OpenAlert {
	key: string;
	title: string;
	detail: string | null;
	href: string | null;
	openedAt: string;
	notifiedAt: string | null;
}

export async function openAlerts(): Promise<OpenAlert[]> {
	try {
		return (
			await db()<
				{
					key: string;
					title: string;
					detail: string | null;
					href: string | null;
					opened_at: Date;
					notified_at: Date | null;
				}[]
			>`select * from ops_alert where closed_at is null order by opened_at desc`
		).map((r) => ({
			key: r.key,
			title: r.title,
			detail: r.detail,
			href: r.href,
			openedAt: r.opened_at.toISOString(),
			notifiedAt: r.notified_at?.toISOString() ?? null
		}));
	} catch (e) {
		if (missingSchema(e)) return [];
		throw e;
	}
}

/** Opens and closes alerts against what needs attention now, and sends what changed. Conditions
 * are tracked even with no webhook set, so the Operations tab can show what is open and since when. */
export async function checkAlerts(o: { daily?: boolean } = {}): Promise<Record<string, number>> {
	const current = attention(await snapshot());
	const open = await openAlerts();
	const { opened, closed } = alertChanges(
		open.map((a) => a.key),
		current
	);
	try {
		for (const a of opened)
			await db()`insert into ops_alert (key, title, detail, href) values (${a.key}, ${a.title}, ${a.detail}, ${a.href})
				on conflict (key) do update set title = excluded.title, detail = excluded.detail, href = excluded.href,
					opened_at = now(), notified_at = null, closed_at = null`;
		if (closed.length)
			await db()`update ops_alert set closed_at = now() where key in ${db()(closed)} and closed_at is null`;
	} catch (e) {
		if (missingSchema(e)) return { opened: 0, closed: 0, sent: 0 };
		throw e;
	}
	const c = await config();
	let sent = 0;
	if (c.webhookEnc && c.origin) {
		const webhook = decrypt(c.webhookEnc, TOKEN_ENCRYPTION_KEY);
		const message = alertMessage(
			opened,
			open.filter((a) => closed.includes(a.key)),
			c.origin
		);
		if (message) {
			await post(webhook, message);
			sent++;
			if (opened.length)
				await db()`update ops_alert set notified_at = now() where key in ${db()(opened.map((a) => a.key))}`;
		}
		if (o.daily) {
			await post(webhook, summaryMessage(current, c.origin));
			sent++;
		}
	}
	return { opened: opened.length, closed: closed.length, sent, attention: current.length };
}

let lastCheck = 0;
/** After a failure is recorded: check, in the background, at most every five minutes. */
function soon(): void {
	if (Date.now() - lastCheck < 5 * 60_000) return;
	lastCheck = Date.now();
	waitUntil(checkAlerts().catch((e) => log('warn', 'alert check failed', { error: errorText(e) })));
}
setFailureHook(soon);
