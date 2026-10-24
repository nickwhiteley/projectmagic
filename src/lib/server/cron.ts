// The daily backstop (spec §7.4, PM47): re-sync everything in case a webhook was missed, then the
// housekeeping. Each step runs on its own, so one that fails doesn't stop the rest, and the run is
// recorded step by step in cron_run, which the Operations tab and the alerts read. Vercel Cron calls
// it through /api/cron/sync; a platform admin can run it from the Operations tab.
import { errorText, type CronStep } from '#lib/core/ops.ts';
import { db } from './db.ts';
import { edits } from './edits.ts';
import { activeProjects } from './projects.ts';
import { reconcileAll } from './billing.ts';
import { purgeDeletedTenants } from './platform.ts';
import { syncAll } from './sync-runner.ts';
import { sendDigests } from './digest.ts';
import { checkAlerts } from './alerts.ts';
import { log, missingSchema, purgeOpsRecords, version } from './ops.ts';

export interface CronResult {
	ok: boolean;
	steps: CronStep[];
	result: Record<string, string>;
}

type StepOutcome = {
	counts?: Record<string, number>;
	detail?: Record<string, unknown>;
	error?: string;
};

export async function runCron(trigger: 'cron' | 'admin' = 'cron'): Promise<CronResult> {
	let runId: string | null = null;
	try {
		const [r] = await db()<{ id: string }[]>`
			insert into cron_run (version) values (${version()}) returning id`;
		runId = r ? String(r.id) : null;
	} catch (e) {
		if (!missingSchema(e)) log('warn', 'could not record cron run', { error: errorText(e) });
	}
	const steps: CronStep[] = [];
	const save = async (ended: boolean) => {
		if (!runId) return;
		await db()`update cron_run set steps_json = ${db().json(JSON.parse(JSON.stringify(steps)))},
			ended_at = ${ended ? new Date() : null}, ok = ${ended ? steps.every((s) => s.ok) : null}
			where id = ${runId}`.catch(() => {});
	};
	const step = async (name: string, run: () => Promise<StepOutcome | void>) => {
		const t0 = Date.now();
		try {
			const out = (await run()) ?? {};
			steps.push({
				step: name,
				ok: !out.error,
				ms: Date.now() - t0,
				...(out.error ? { error: out.error } : {}),
				...(out.counts ? { counts: out.counts } : {}),
				...(out.detail ? { detail: out.detail } : {})
			});
		} catch (e) {
			steps.push({ step: name, ok: false, ms: Date.now() - t0, error: errorText(e, 500) });
			log('error', 'cron step failed', { step: name, error: errorText(e), trigger });
		}
		// Saved after each step, so a run that dies part way says how far it got.
		await save(false);
	};

	let result: Record<string, string> = {};
	await step('sync', async () => {
		const r = await syncAll();
		result = r.result;
		const values = Object.values(r.result);
		const n = (v: string) => values.filter((x) => x === v).length;
		const failed = n('failed');
		return {
			counts: { ran: n('ran'), failed, queued: n('queued'), deferred: n('deferred') },
			// Each failing project is its own alert (PM50), so the step itself is still fine.
			detail: { deferred: r.deferred }
		};
	});
	// The backstop for batch edits (PM25): saves any that page loads and webhooks didn't.
	await step('pending edits', async () => {
		let held: { project_id: string }[] = [];
		try {
			held = await db()`select distinct project_id from pending_edit`;
		} catch (e) {
			if (!missingSchema(e)) throw e;
		}
		let projects = 0;
		for (const p of await activeProjects())
			if (held.some((h) => String(h.project_id) === p.id)) {
				await edits.savePendingIfDue(p);
				projects++;
			}
		return { counts: { projects } };
	});
	await step('tidy', async () => {
		await db()`delete from blob_text where fetched_at < now() - interval '14 days'`.catch(() => []);
		await db()`delete from webhook_delivery where received_at < now() - interval '14 days'`;
		// Background work whose function died is marked, so it doesn't look as if it still runs.
		await db()`update job_run set outcome = 'stuck', ended_at = now(), error = 'never finished'
			where outcome = 'running' and started_at < now() - interval '15 minutes'`.catch(() => {});
		return { counts: await purgeOpsRecords() };
	});
	// The provider is the authority on subscriptions: copy its state, and move tenants to their tier (§7.3).
	await step('billing', async () => {
		const r = await reconcileAll();
		return { counts: { tenants: r.tenants, failed: r.failed } };
	});
	await step('purge tenants', async () => {
		await purgeDeletedTenants();
	});
	// The daily digest to Slack (PM39), after the sync so it is current.
	await step('digest', async () => {
		// A tenant's failing digest is shown to it and to admins on its own (PM54).
		return { counts: await sendDigests() };
	});
	// Last, so the alerts see this run (PM55).
	await step('alerts', async () => ({ counts: await checkAlerts({ daily: trigger === 'cron' }) }));

	await save(true);
	return { ok: steps.every((s) => s.ok), steps, result };
}
