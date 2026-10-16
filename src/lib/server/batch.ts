// Pending edits (PM25): the storage and the overlay. An edit made in batch mode is a row in
// `pending_edit` until a save writes the batch as one commit (edits.ts). The views read the
// project's backlog with the pending edits replayed on top, so an edit shows at once.
import { applyBatch, opItem, type PendingOp } from '#lib/core/batch.ts';
import type { Op } from '#lib/core/splice.ts';
import type { StoredBacklog } from '#lib/core/state.ts';
import { db } from './db.ts';
import { installationClient } from './github-app.ts';
import { fetchBlobs, parseBlob } from './sync.ts';

export interface PendingRow extends PendingOp {
	file: string | null;
	item: string;
	userId: string;
	login: string | null;
	createdAt: number;
	conflict: string | null;
	claimed: boolean;
}

/** A claim on edits being saved goes stale after this long. */
const STALE_CLAIM = '3 minutes';

/** The table may not exist until migration 005 has run: no pending edits is then the right answer. */
const missingTable = (e: { code?: string }) => {
	if (e?.code === '42P01' || e?.code === '42703') return [];
	throw e;
};

export async function listPending(projectId: string): Promise<PendingRow[]> {
	const rows = await db()<
		{
			id: string;
			file: string | null;
			item_id: string;
			op: Op;
			base: string | null;
			user_id: string;
			login: string | null;
			created_at: Date;
			conflict: string | null;
			claimed: boolean;
		}[]
	>`select p.id, p.file, p.item_id, p.op, p.base, p.user_id, u.github_login as login, p.created_at, p.conflict,
			(p.claimed_at is not null and p.claimed_at > now() - ${STALE_CLAIM}::interval) as claimed
		from pending_edit p left join app_user u on u.id = p.user_id
		where p.project_id = ${projectId} order by p.id`.catch(missingTable);
	return rows.map((r) => ({
		id: Number(r.id),
		file: r.file,
		item: r.item_id,
		op: r.op,
		base: r.base,
		userId: String(r.user_id),
		login: r.login,
		createdAt: r.created_at.getTime(),
		conflict: r.conflict,
		claimed: r.claimed
	}));
}

/** A cheap fingerprint of the pending edits, so cached state is rebuilt when they change. */
export async function pendingKey(projectId: string): Promise<string> {
	const [r] = await db()<{ k: string }[]>`
		select count(*) || ':' || coalesce(max(id), 0) || ':' || count(conflict) as k
		from pending_edit where project_id = ${projectId}`.catch(missingTable);
	return r?.k ?? '';
}

export async function queue(
	projectId: string,
	userId: string,
	op: Op,
	base: string | null,
	file: string | null
): Promise<number> {
	await db()`insert into pending_edit (project_id, user_id, file, item_id, op, base)
		values (${projectId}, ${userId}, ${file}, ${opItem(op)}, ${db().json(JSON.parse(JSON.stringify(op)))}, ${base})`;
	const [r] = await db()<{ n: number }[]>`
		select count(*)::int as n from pending_edit where project_id = ${projectId}`;
	return r?.n ?? 1;
}

export async function discard(projectId: string, id: number): Promise<void> {
	await db()`delete from pending_edit where project_id = ${projectId} and id = ${id}`;
}

export async function batchPref(userId: string): Promise<boolean> {
	const [r] = await db()<{ batch_edits: boolean }[]>`
		select batch_edits from user_pref where user_id = ${userId}`.catch(missingTable);
	return !!r?.batch_edits;
}

/** The text of a blob never changes, so it is kept by oid. */
const texts = new Map<string, string>();

async function blobText(
	installation: number,
	owner: string,
	repo: string,
	oid: string
): Promise<string | null> {
	const hit = texts.get(oid);
	if (hit !== undefined) return hit;
	const got = await fetchBlobs(installationClient(installation), owner, repo, [oid]);
	const text = got.get(oid) ?? null;
	if (text !== null) {
		if (texts.size > 50) texts.clear();
		texts.set(oid, text);
	}
	return text;
}

/**
 * The backlog (or bugs file) on main with its pending edits replayed, parsed as the sync would.
 * Null when there is nothing pending for the file or its text can't be read; an edit that no
 * longer applies is left out here and reported when the batch is saved.
 */
export async function overlayBacklog(
	project: { owner: string; repo: string; installationId: number },
	main: string,
	oid: string,
	pending: PendingRow[]
): Promise<StoredBacklog | null> {
	const live = pending.filter((p) => !p.conflict);
	if (!live.length) return null;
	const text = await blobText(project.installationId, project.owner, project.repo, oid);
	if (text === null) return null;
	const out = applyBatch(text, live);
	return parseBlob('backlog', out.text, project.repo, main) as StoredBacklog;
}
