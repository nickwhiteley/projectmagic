// An edit from the app (spec §10): resolve where the backlog is, make the edit as the user,
// record it, keep the PR's description current, remember what state the edits are in, and sync.
import { EDIT_BRANCH } from '#lib/core/branchref.ts';
import type { Op } from '#lib/core/splice.ts';
import { parseConfig, type Config } from '#lib/core/config.ts';
import { db } from './db.ts';
import { syncUntil } from './sync-runner.ts';
import type { SessionUser } from './users.ts';
import type { ProjectRow } from './projects.ts';
import { userClient } from './user-token.ts';
import { applyEdit, prBody, type WriteResult } from './write.ts';

async function target(project: ProjectRow) {
	const [row] = await db()<
		{ config_json: Config | null }[]
	>`select config_json from project where id = ${project.id}`;
	const config =
		row?.config_json ?? parseConfig(null, { name: project.repo, defaultBranch: 'main' }).config;
	const files = await db()<{ path: string }[]>`
		select path from ref_file where project_id = ${project.id} and ref_name = ${config.main}`;
	const path = config.backlog.find((p) => files.some((f) => f.path === p));
	if (!path) throw new Error('This project has no backlog to edit.');
	return {
		owner: project.owner,
		repo: project.repo,
		main: config.main,
		path,
		autoMerge: config.autoMerge
	};
}

export async function edit(
	user: SessionUser,
	project: ProjectRow,
	op: Op,
	base: string | null
): Promise<WriteResult> {
	const gh = userClient(user.id);
	const t = await target(project);
	const itemId = op.op === 'add' ? op.item.id : op.id;
	let result: WriteResult;
	try {
		result = await applyEdit(gh, t, op, base);
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
						message: `Backlog: ${e.op} ${e.item_id}`,
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

/** An item added in the last minute, which the cache may not hold yet (PM17). */
export async function justAdded(projectId: string, itemId: string): Promise<boolean> {
	const [r] = await db()<{ n: number }[]>`
		select count(*)::int as n from edit_log
		where project_id = ${projectId} and item_id = ${itemId} and op = 'add' and error is null
		and at > now() - interval '1 minute'`;
	return (r?.n ?? 0) > 0;
}

export const edits = { edit, mergeEdits, justAdded };
