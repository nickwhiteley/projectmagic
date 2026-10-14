// Done detection (spec §7.3). Shipped items are deleted from `backlog.md`, so "done" comes from
// history: walk main's versions of the file, oldest first, and diff the id sets of consecutive
// versions. An id present before and absent after is done at that commit; an id that reappears
// later is no longer done. Each step depends only on the versions, so results can be cached
// forever and a later sync continues from the state it left.
import { parseBacklog } from './backlog';

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

export interface HistoryState {
	/** The items in the last version seen. */
	present: Map<string, { title: string; text: string }>;
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
		const next = new Map<string, { title: string; text: string }>();
		for (const it of parseBacklog(v.text).items)
			if (!next.has(it.id))
				next.set(it.id, { title: it.title, text: v.text.slice(it.start, it.end) });

		for (const [id, was] of present)
			if (!next.has(id))
				done.set(id, { id, ...was, removedOid: v.oid, removedAt: v.date, pr: v.pr });
		for (const id of next.keys()) done.delete(id);
		present = next;
	}
	return { present, done, lastOid };
}
