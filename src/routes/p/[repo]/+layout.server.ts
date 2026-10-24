import { can } from '#lib/core/access.ts';
import { pendingLabel } from '#lib/core/batch.ts';
import { batchPref, listPending } from '#lib/server/batch.ts';
import { edits } from '#lib/server/edits.ts';
import { waitUntil } from '@vercel/functions';
import { projectState } from '#lib/server/project-state.ts';
import type { LayoutServerLoad } from './$types';
import { accessCtx } from '#lib/server/tenants.ts';
import { projectSyncHealth } from '#lib/server/ops-view.ts';
import { syncFailure } from '#lib/core/ops.ts';

export const load: LayoutServerLoad = async ({ locals, params }) => {
	const project = locals.project!;
	// A batch of pending edits that is due is saved when anyone loads a page (PM25), in the
	// background: the page doesn't wait for the commit, and shows the edits until it lands.
	if (!locals.tenant?.support) waitUntil(edits.savePendingIfDue(project));
	const s = await projectState({ locals, params });
	const pending = s.batchEdits ? await listPending(project.id) : [];
	const waiting = pending.filter((e) => !e.conflict && !e.claimed);
	const saving = pending.some((e) => e.claimed && !e.conflict);
	const times = waiting.map((e) => e.createdAt);
	const now = Date.now();
	const h = s.health;
	const sh = await projectSyncHealth(project.id);
	return {
		project: {
			repo: s.repo,
			param: project.param,
			owner: s.owner,
			name: s.name,
			main: s.main,
			lastSyncAt: s.lastSyncAt,
			lastError: h.lastError,
			// "Failed 6 times in a row, for 2 days" rather than only the last message (PM50).
			syncFailure: syncFailure({
				lastError: h.lastError,
				failingSince: sh.failingSince,
				failCount: sh.failCount
			}),
			sync: sh,
			overLimit: project.overLimit,
			hasBacklog: s.hasBacklog,
			hasPlan: !!s.plan,
			canEdit: can(locals.user, 'edit', accessCtx(locals, project)),
			canMerge: can(locals.user, 'merge', accessCtx(locals, project)),
			edits: project.edits,
			batch: {
				allowed: s.batchEdits,
				mine: s.batchEdits && locals.user ? await batchPref(locals.user.id) : false,
				pending: pending.map((e) => ({
					id: e.id,
					label: pendingLabel(e.op),
					by: e.login,
					conflict: e.conflict
				})),
				saving,
				// When the page should look again: while a save runs, shortly; otherwise the earlier
				// of a quiet minute and five minutes.
				dueInMs: saving
					? 5000
					: times.length
						? Math.max(0, Math.min(Math.max(...times) + 60_000, Math.min(...times) + 300_000) - now)
						: null
			},
			counts: {
				items: s.items.length,
				// Its own epics, and other repositories' that its items join (PM36).
				epics:
					s.epics.length + new Set(s.items.map((i) => i.epic).filter((e) => e?.includes(':'))).size,
				done: s.done.length,
				branches: s.branches.filter((b) => b.active).length
			}
		}
	};
};
