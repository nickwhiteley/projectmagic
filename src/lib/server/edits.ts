// An edit from the app (spec §10): resolve where the backlog is, make the edit as the user,
// record it, keep the PR's description current, remember what state the edits are in, and sync.
import { EDIT_BRANCH } from '#lib/core/branchref.ts';
import type { Op } from '#lib/core/splice.ts';
import { parseConfig, type Config } from '#lib/core/config.ts';
import { applyBatch, describeBatch, due as batchDue } from '#lib/core/batch.ts';
import { batchPref, listPending, queue } from './batch.ts';
import { db } from './db.ts';
import { syncUntil } from './sync-runner.ts';
import { userById, type SessionUser } from './users.ts';
import type { ProjectRow } from './projects.ts';
import { ReauthRequired, userClient } from './user-token.ts';
import {
	applyChange,
	applyEdit,
	prBody,
	type FileChange,
	type WriteResult,
	type WriteTarget
} from './write.ts';

/** `file` is the item's file when it isn't the main backlog (PM29: `bugs.md`). */
async function target(project: ProjectRow, file: string | null = null) {
	const [row] = await db()<
		{ config_json: Config | null }[]
	>`select config_json from project where id = ${project.id}`;
	const config =
		row?.config_json ?? parseConfig(null, { name: project.repo, defaultBranch: 'main' }).config;
	const files = await db()<{ path: string }[]>`
		select path from ref_file where project_id = ${project.id} and ref_name = ${config.main}`;
	const path = file
		? files.some((f) => f.path === file)
			? file
			: undefined
		: config.backlog.find((p) => files.some((f) => f.path === p));
	if (!path) throw new Error(`This project has no ${file ?? 'backlog'} to edit.`);
	return {
		owner: project.owner,
		repo: project.repo,
		main: config.main,
		path,
		autoMerge: config.autoMerge,
		batchEdits: config.batchEdits
	};
}

/** What an edit returns: a write's result, or `queued` when it is held for the next save (PM25). */
export type EditResult = WriteResult | { kind: 'queued'; count: number };

export async function edit(
	user: SessionUser,
	project: ProjectRow,
	op: Op,
	base: string | null,
	file: string | null = null
): Promise<EditResult> {
	const t = await target(project, file);
	const itemId = op.op === 'add' ? op.item.id : op.id;
	// Batch mode (PM25): the project allows it and this person chose it.
	if (t.batchEdits && (await batchPref(user.id)))
		return { kind: 'queued', count: await queue(project.id, user.id, op, base, file) };
	return perform(user, project, t, (gh) => applyEdit(gh, t, op, base), { op: op.op, item: itemId });
}

/**
 * A change to another file in the repository: a plan task's status, or a document (PM6). The
 * path is trusted only as far as the caller has checked it; GitHub refuses what it can't find.
 */
export async function editFile(
	user: SessionUser,
	project: ProjectRow,
	path: string,
	change: FileChange,
	base: string | null,
	log: { op: string; item: string }
): Promise<WriteResult> {
	const t = await targetAt(project, path);
	return perform(user, project, t, (gh) => applyChange(gh, t, change, base), log);
}

async function targetAt(project: ProjectRow, path: string): Promise<WriteTarget> {
	const [row] = await db()<
		{ config_json: Config | null }[]
	>`select config_json from project where id = ${project.id}`;
	const config =
		row?.config_json ?? parseConfig(null, { name: project.repo, defaultBranch: 'main' }).config;
	return {
		owner: project.owner,
		repo: project.repo,
		main: config.main,
		path,
		autoMerge: config.autoMerge
	};
}

function logMessage(op: string, item: string): string {
	if (op === 'plan') return `Plan: set ${item}`;
	if (op === 'doc') return `Doc: edit ${item}`;
	if (op === 'batch') return `Backlog: batch (${item})`;
	return `Backlog: ${op} ${item}`;
}

async function perform(
	user: SessionUser,
	project: ProjectRow,
	t: WriteTarget,
	run: (gh: ReturnType<typeof userClient>) => Promise<WriteResult>,
	log: { op: string; item: string }
): Promise<WriteResult> {
	const gh = userClient(user.id);
	const itemId = log.item;
	const op = { op: log.op };
	let result: WriteResult;
	try {
		result = await run(gh);
	} catch (e) {
		await db()`insert into edit_log (project_id, user_id, item_id, op, error)
			values (${project.id}, ${user.id}, ${itemId}, ${op.op}, ${String(e)})`;
		throw e;
	}

	if (result.kind === 'merged' || result.kind === 'pending') {
		await db()`insert into edit_log (project_id, user_id, item_id, op, base_oid, commit_oid, pr_number)
			values (${project.id}, ${user.id}, ${itemId}, ${op.op}, ${result.baseOid}, ${result.commit}, ${result.pr})`;
		if (result.kind === 'pending') {
			// The PR stays open: describe every edit it holds.
			const edits = await db()<{ op: string; item_id: string; login: string; at: Date }[]>`
				select e.op, e.item_id, u.github_login as login, e.at from edit_log e
				left join app_user u on u.id = e.user_id
				where e.project_id = ${project.id} and e.pr_number = ${result.pr} and e.error is null order by e.at`;
			await gh.send('PATCH', `/repos/${project.owner}/${project.repo}/pulls/${result.pr}`, {
				body: prBody(
					edits.map((e) => ({
						message: logMessage(e.op, e.item_id),
						by: e.login,
						at: e.at.toISOString()
					}))
				)
			});
		}
	} else if (result.kind === 'blocked' || result.kind === 'refused') {
		await db()`insert into edit_log (project_id, user_id, item_id, op, error)
			values (${project.id}, ${user.id}, ${itemId}, ${op.op}, ${result.detail})`;
	}

	const state =
		result.kind === 'merged'
			? { state: null, detail: null, pr: null }
			: result.kind === 'pending'
				? { state: 'pending', detail: result.reason, pr: result.pr }
				: result.kind === 'blocked'
					? { state: result.state, detail: result.detail, pr: result.pr ?? null }
					: null;
	if (state)
		await db()`update project set edit_state = ${state.state}, edit_detail = ${state.detail}, edit_pr = ${state.pr}
			where id = ${project.id}`;
	// Wait until the cache holds the commit, so the page the action redirects to shows the edit.
	if (result.kind === 'merged') await syncUntil(project.id, t.main, result.commit);
	else if (result.kind === 'pending') await syncUntil(project.id, EDIT_BRANCH, result.commit);
	return result;
}

/** The *Merge* button for a maintainer (§10.3): merge the open edits PR as them. */
export async function mergeEdits(
	user: SessionUser,
	project: ProjectRow
): Promise<{ ok: boolean; detail: string }> {
	const [row] = await db()<
		{ edit_pr: number | null }[]
	>`select edit_pr from project where id = ${project.id}`;
	if (!row?.edit_pr) return { ok: false, detail: 'There is no open edits PR.' };
	const gh = userClient(user.id);
	const repo = `/repos/${project.owner}/${project.repo}`;
	const res = await gh.send<{ message?: string; sha?: string }>(
		'PUT',
		`${repo}/pulls/${row.edit_pr}/merge`,
		{
			merge_method: 'squash'
		}
	);
	if (res.status !== 200)
		return { ok: false, detail: res.body?.message ?? `GitHub said ${res.status}` };
	await gh.send('DELETE', `${repo}/git/refs/heads/projectmagic`);
	await db()`update project set edit_state = null, edit_detail = null, edit_pr = null where id = ${project.id}`;
	if (res.body?.sha) await syncUntil(project.id, (await target(project)).main, res.body.sha);
	return { ok: true, detail: `Merged PR #${row.edit_pr}.` };
}

export interface SaveResult {
	/** Edits written in the commit, and edits left pending because their item changed. */
	saved: number;
	conflicts: number;
	detail: string | null;
}

/**
 * Saves the pending edits (PM25): each file's batch, in order, as one commit on the edits branch
 * and one PR, as a single edit would. Edits are claimed first so two saves never take the same
 * ones. An edit whose item changed on main is left pending, flagged, and the others are saved.
 * `by` is who pressed Save; otherwise the edits' first author acts, with their token.
 */
export async function savePending(
	project: ProjectRow,
	by: SessionUser | null = null
): Promise<SaveResult> {
	const claimed = await db()<
		{ id: string; user_id: string; file: string | null; op: Op; base: string | null }[]
	>`update pending_edit set claimed_at = now()
		where project_id = ${project.id} and conflict is null
		and (claimed_at is null or claimed_at < now() - interval '3 minutes')
		returning id, user_id, file, op, base`;
	const edits = claimed.map((r) => ({
		id: Number(r.id),
		file: r.file,
		op: r.op,
		base: r.base,
		user: r.user_id
	}));
	edits.sort((a, b) => a.id - b.id);
	const out: SaveResult = { saved: 0, conflicts: 0, detail: null };
	const release = (ids: number[]) =>
		ids.length
			? db()`update pending_edit set claimed_at = null where id in ${db()(ids)}`
			: Promise.resolve();

	for (const file of new Set(edits.map((e) => e.file))) {
		const batch = edits.filter((e) => e.file === file);
		const ids = batch.map((e) => e.id);
		try {
			const user = by ?? (await userById(batch[0].user));
			if (!user) throw new Error('The person who made these edits is no longer a user.');
			const t = await target(project, file);
			let applied: number[] = [];
			let conflicts: { id: number; detail: string }[] = [];
			const result = await perform(
				user,
				project,
				t,
				(gh) =>
					applyChange(gh, t, {
						apply: (text) => {
							const r = applyBatch(text, batch);
							applied = r.applied;
							conflicts = r.conflicts;
							return r.text;
						},
						describe: (text) =>
							describeBatch(
								text,
								batch.filter((e) => applied.includes(e.id)).map((e) => e.op)
							)
					}),
				{
					op: 'batch',
					item: [...new Set(batch.filter((e) => applied.includes(e.id)).map((e) => itemOf(e.op)))]
						.slice(0, 20)
						.join(', ')
				}
			);
			if (result.kind === 'merged' || result.kind === 'pending' || result.kind === 'unchanged') {
				if (applied.length) await db()`delete from pending_edit where id in ${db()(applied)}`;
				for (const c of conflicts)
					await db()`update pending_edit set conflict = ${c.detail}, claimed_at = null where id = ${c.id}`;
				out.saved += applied.length;
				out.conflicts += conflicts.length;
			} else {
				await release(ids);
				out.detail = result.kind === 'blocked' || result.kind === 'refused' ? result.detail : null;
			}
		} catch (e) {
			await release(ids);
			out.detail = e instanceof Error ? e.message : String(e);
			if (e instanceof ReauthRequired) throw e;
			console.error(`save pending ${project.owner}/${project.repo}:`, e);
		}
	}
	return out;
}

const itemOf = (op: Op) => (op.op === 'add' ? op.item.id : op.id);

/**
 * Saves the pending edits if a batch is due (a quiet minute since the last edit, or five since the
 * first). Called on page loads and webhooks, so a save needs no scheduler of its own. Never throws:
 * a page must still load if the save can't be made.
 */
export async function savePendingIfDue(project: ProjectRow): Promise<void> {
	try {
		const pending = (await listPending(project.id)).filter((p) => !p.conflict && !p.claimed);
		if (batchDue(pending, Date.now())) await savePending(project);
	} catch (e) {
		if (!(e instanceof ReauthRequired)) console.error(`pending save ${project.repo}:`, e);
	}
}

/** An item added in the last minute, which the cache may not hold yet (PM17). */
export async function justAdded(projectId: string, itemId: string): Promise<boolean> {
	const [r] = await db()<{ n: number }[]>`
		select count(*)::int as n from edit_log
		where project_id = ${projectId} and item_id = ${itemId} and op = 'add' and error is null
		and at > now() - interval '1 minute'`;
	return (r?.n ?? 0) > 0;
}

export const edits = { edit, editFile, mergeEdits, justAdded, savePending, savePendingIfDue };
