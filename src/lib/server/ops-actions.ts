// What a platform admin can do from the Operations tab to put a problem right (PM51). Each is the
// same thing the app would do on its own, done now, and each is written to the audit log with who
// did it. None of them reads or changes a tenant's content.
import { errorText } from '#lib/core/ops.ts';
import { waitUntil } from '@vercel/functions';
import { runCron } from './cron.ts';
import { db } from './db.ts';
import { resendDigest } from './digest.ts';
import { edits } from './edits.ts';
import { checkInstallationToken } from './github-app.ts';
import { activeProjects } from './projects.ts';
import { syncNow, syncProjectList } from './sync-runner.ts';
import { audit } from './tenants.ts';
import { checkAlerts, testAlert } from './alerts.ts';

export type OpsAction =
	| 'sync'
	| 'unstick'
	| 'release'
	| 'digest'
	| 'cron'
	| 'resolve'
	| 'checkToken'
	| 'projects'
	| 'alerts'
	| 'testAlert';

export const OPS_ACTIONS: OpsAction[] = [
	'sync',
	'unstick',
	'release',
	'digest',
	'cron',
	'resolve',
	'checkToken',
	'projects',
	'alerts',
	'testAlert'
];

export type ActionResult = { ok: true; message: string } | { ok: false; message: string };

const id = (v: string | undefined) => (v && /^\d+$/.test(v) ? v : null);

/** Runs an action as `actorId`. Never throws: a failure is the result, to show on the page. */
export async function runAction(
	action: OpsAction,
	params: Record<string, string>,
	actorId: string
): Promise<ActionResult> {
	try {
		const r = await perform(action, params, actorId);
		await audit(null, actorId, `platform.ops.${action}`, target(action, params), {
			...params,
			ok: r.ok
		}).catch(() => {});
		return r;
	} catch (e) {
		return { ok: false, message: errorText(e, 500) };
	}
}

function target(action: OpsAction, p: Record<string, string>): string | null {
	if (p.project) return `project:${p.project}`;
	if (p.tenant) return `tenant:${p.tenant}`;
	if (p.installation) return `installation:${p.installation}`;
	if (p.fingerprint) return `error:${p.fingerprint}`;
	return action === 'cron' ? 'cron' : null;
}

async function perform(
	action: OpsAction,
	p: Record<string, string>,
	actorId: string
): Promise<ActionResult> {
	switch (action) {
		case 'sync': {
			const project = id(p.project);
			if (!project) return { ok: false, message: 'Which project?' };
			const r = await syncNow(project, 'admin');
			return r === 'failed'
				? { ok: false, message: 'The sync failed again: see its run below.' }
				: {
						ok: true,
						message:
							r === 'queued' ? 'A sync is running; it will run again when it ends.' : 'Synced.'
					};
		}
		case 'unstick': {
			const project = id(p.project);
			if (!project) return { ok: false, message: 'Which project?' };
			await db()`update project set sync_started_at = null, sync_again = false where id = ${project}`;
			await db()`update job_run set outcome = 'stuck', ended_at = now(), error = 'cleared by an admin'
				where project_id = ${project} and kind = 'sync' and outcome = 'running'`.catch(() => {});
			const r = await syncNow(project, 'admin');
			return r === 'failed'
				? { ok: false, message: 'Cleared, but the sync failed: see its run below.' }
				: { ok: true, message: 'Cleared, and synced.' };
		}
		case 'release': {
			const project = id(p.project);
			if (!project) return { ok: false, message: 'Which project?' };
			const r = await db()`update pending_edit set claimed_at = null
				where project_id = ${project} and claimed_at is not null and conflict is null`;
			const row = (await activeProjects()).find((x) => x.id === project);
			// Saved as their authors, now if the batch is due, else on the next page load or webhook.
			if (row) waitUntil(edits.savePendingIfDue(row));
			return { ok: true, message: `Released ${r.count} edit${r.count === 1 ? '' : 's'}.` };
		}
		case 'digest': {
			const tenant = id(p.tenant);
			if (!tenant) return { ok: false, message: 'Which tenant?' };
			const sent = await resendDigest(tenant);
			return {
				ok: true,
				message: sent ? 'Sent.' : 'Nothing waits on anyone, so there was nothing to send.'
			};
		}
		case 'cron':
			// It can take minutes: it runs on after the page answers, and the run appears under Cron.
			waitUntil(runCron('admin'));
			return { ok: true, message: 'The cron is running. Reload in a minute to see its steps.' };
		case 'resolve': {
			if (!p.fingerprint) return { ok: false, message: 'Which error?' };
			await db()`update error_group set resolved_at = now(), resolved_by = ${actorId}
				where fingerprint = ${p.fingerprint}`;
			return { ok: true, message: 'Resolved. It reopens if it happens again.' };
		}
		case 'checkToken': {
			const inst = id(p.installation);
			if (!inst) return { ok: false, message: 'Which installation?' };
			const error = await checkInstallationToken(Number(inst));
			return error
				? { ok: false, message: `GitHub still refuses it: ${error}` }
				: { ok: true, message: 'GitHub gave the App a token: its projects can sync.' };
		}
		case 'projects': {
			const n = await syncProjectList();
			return { ok: true, message: `Listed the App’s installations: ${n} repositories.` };
		}
		case 'alerts': {
			const r = await checkAlerts();
			return { ok: true, message: `Checked: ${r.opened ?? 0} opened, ${r.closed ?? 0} cleared.` };
		}
		case 'testAlert':
			await testAlert();
			return { ok: true, message: 'Sent a test message.' };
	}
}
