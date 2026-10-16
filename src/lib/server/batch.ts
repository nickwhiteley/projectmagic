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
	const [r] = await db()<{ n: number }[]>`
		with added as (
			insert into pending_edit (project_id, user_id, file, item_id, op, base)
			values (${projectId}, ${userId}, ${file}, ${opItem(op)}, ${db().json(JSON.parse(JSON.stringify(op)))}, ${base})
			returning 1
		)
		select (select count(*) from pending_edit where project_id = ${projectId})::int + 1 as n`;
	return r?.n ?? 1;
}

/** False when a save holds the edit: it may already be on its way to main, so it stays. */
export async function discard(projectId: string, id: number): Promise<boolean> {
	const gone = await db()`delete from pending_edit where project_id = ${projectId} and id = ${id}
		and (claimed_at is null or claimed_at < now() - ${STALE_CLAIM}::interval) returning id`;
	return gone.length > 0;
}

/** On unless the person turned it off; off when the migration hasn't run, so edits save at once. */
export async function batchPref(userId: string): Promise<boolean> {
	try {
		const [r] = await db()<
			{ batch_edits: boolean }[]
		>`select batch_edits from user_pref where user_id = ${userId}`;
		return r ? r.batch_edits : true;
	} catch (e) {
		missingTable(e as { code?: string });
		return false;
	}
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
	const keep = (text: string) => {
		if (texts.size > 50) texts.clear();
		texts.set(oid, text);
		return text;
	};
	// The database next (a round trip), GitHub last (a second or more).
	const [row] = await db()<{ text: string }[]>`select text from blob_text where oid = ${oid}`.catch(
		missingTable
	);
	if (row) return keep(row.text);
	const got = await fetchBlobs(installationClient(installation), owner, repo, [oid]);
	const text = got.get(oid) ?? null;
	if (text === null) return null;
	await db()`insert into blob_text (oid, text) values (${oid}, ${text}) on conflict do nothing`.catch(
		missingTable
	);
	return keep(text);
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
	// Every splice parses the whole file, so a new edit is applied to the last result when the
	// earlier edits are the same, not to the file again from the top.
	const ids = live.map((p) => p.id);
	const key = `${project.repo}:${oid}:${live[0].file ?? ''}`;
	const memo = replayed.get(key);
	const resume = memo && memo.ids.every((id, i) => ids[i] === id) && memo.ids.length <= ids.length;
	const out = applyBatch(resume ? memo.text : text, resume ? live.slice(memo.ids.length) : live);
	if (replayed.size > 20) replayed.clear();
	// Edits skipped as conflicts are still "seen", so they aren't tried again from the top.
	replayed.set(key, { ids, text: out.text });
	return parseBlob('backlog', out.text, project.repo, main) as StoredBacklog;
}

/** The last replay for a file: the edits applied, and the text they made. */
const replayed = new Map<string, { ids: number[]; text: string }>();
