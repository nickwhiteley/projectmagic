// Done detection (spec §7.3). Shipped items are deleted from `backlog.md`, so "done" comes from
// history: walk main's versions of the file, oldest first, and diff the id sets of consecutive
// versions. An id present before and absent after is done at that commit; an id that reappears
// later is no longer done. Each step depends only on the versions, so results can be cached
// forever and a later sync continues from the state it left.
import { parseBacklog } from './backlog.ts';

export interface Version {
	oid: string;
	/** ISO 8601. */
	date: string;
	/** The PR that merged this commit, if known. */
	pr: number | null;
	/** The file at this commit, or null where it doesn't exist (deleted or moved): skipped. */
	text: string | null;
}

export interface DoneItem {
	id: string;
	title: string;
	/** The item's last source on main, heading included. */
	text: string;
	removedOid: string;
	removedAt: string;
	pr: number | null;
}

/** An item's status at a commit, or its arrival (`from` null) or removal (`to` null): PM9. */
export interface StatusChange {
	id: string;
	from: string | null;
	to: string | null;
	at: string;
	oid: string;
}

export interface HistoryState {
	/** The items in the last version seen; `status` is missing from cursors saved before PM9. */
	present: Map<string, { title: string; text: string; status?: string | null }>;
	done: Map<string, DoneItem>;
	/** The last commit walked, for the next sync's cursor. */
	lastOid: string | null;
}

export function emptyHistory(): HistoryState {
	return { present: new Map(), done: new Map(), lastOid: null };
}

/** Returns a new state; `state` is not changed. */
export function advanceHistory(state: HistoryState, versions: Version[]): HistoryState {
	let present = state.present;
	const done = new Map(state.done);
	let lastOid = state.lastOid;

	for (const v of versions) {
		lastOid = v.oid;
		if (v.text === null) continue;
		const next = new Map<string, { title: string; text: string; status: string | null }>();
		for (const it of parseBacklog(v.text).items)
			if (!next.has(it.id))
				next.set(it.id, {
					title: it.title,
					text: v.text.slice(it.start, it.end),
					status: it.meta?.status ?? null
				});

		for (const [id, was] of present)
			if (!next.has(id))
				done.set(id, {
					id,
					title: was.title,
					text: was.text,
					removedOid: v.oid,
					removedAt: v.date,
					pr: v.pr
				});
		for (const id of next.keys()) done.delete(id);
		present = next;
	}
	return { present, done, lastOid };
}

/**
 * Every status change over the same versions (PM9): an item arriving (`from` null), changing
 * status, or leaving (`to` null). Not part of the state, so a walk in two parts gives the same
 * state as one; the changes of the two parts together are the changes of the one.
 */
export function statusChanges(state: HistoryState, versions: Version[]): StatusChange[] {
	const changes: StatusChange[] = [];
	let present = new Map([...state.present].map(([id, p]) => [id, p.status]));
	for (const v of versions) {
		if (v.text === null) continue;
		const next = new Map<string, string | null>();
		for (const it of parseBacklog(v.text).items)
			if (!next.has(it.id)) next.set(it.id, it.meta?.status ?? null);
		for (const [id, now] of next) {
			if (!present.has(id)) changes.push({ id, from: null, to: now, at: v.date, oid: v.oid });
			else {
				const was = present.get(id);
				// A cursor saved before PM9 doesn't know the status, so that step says nothing.
				if (was !== undefined && was !== now)
					changes.push({ id, from: was, to: now, at: v.date, oid: v.oid });
			}
		}
		for (const [id, was] of present)
			if (!next.has(id)) changes.push({ id, from: was ?? null, to: null, at: v.date, oid: v.oid });
		present = next;
	}
	return changes;
}
