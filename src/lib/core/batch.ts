// Batch edits (PM25): pending edits replayed, in order, on a backlog's text. Each is checked the
// way a single edit is: the item must still be as the person saw it. An edit that can't be applied
// is left out and reported, and the others still apply.
import { parseBacklog } from './backlog.ts';
import { describe, itemSource, splice, SpliceError, type Op } from './splice.ts';

export interface PendingOp {
	id: number;
	op: Op;
	/** The item's source as the person saw it; null for an add. */
	base: string | null;
}

export interface BatchResult {
	text: string;
	applied: number[];
	conflicts: { id: number; detail: string }[];
}

export const opItem = (op: Op): string => (op.op === 'add' ? op.item.id : op.id);

export function applyBatch(text: string, edits: PendingOp[]): BatchResult {
	const applied: number[] = [];
	const conflicts: BatchResult['conflicts'] = [];
	for (const e of edits) {
		const item = opItem(e.op);
		if (e.base !== null && e.op.op !== 'add') {
			const now = itemSource(text, e.op.id);
			if (now !== e.base) {
				conflicts.push({
					id: e.id,
					detail:
						now === null ? `${item} is no longer there` : `${item} has changed since this edit`
				});
				continue;
			}
		}
		try {
			text = splice(text, e.op);
			applied.push(e.id);
		} catch (err) {
			if (!(err instanceof SpliceError)) throw err;
			conflicts.push({ id: e.id, detail: err.message });
		}
	}
	return { text, applied, conflicts };
}

/** The commit message for a batch: the edit's own message for one, else a count and the items. */
export function describeBatch(before: string, ops: Op[]): string {
	if (ops.length === 1) return describe(ops[0], parseBacklog(before));
	const items = [...new Set(ops.map(opItem))];
	const shown = items.slice(0, 6).join(', ') + (items.length > 6 ? ', …' : '');
	return `Backlog: ${ops.length} edits (${shown})`;
}

/** Whether a batch is due: a quiet minute since the last edit, or five since the first. */
export function due(
	pending: { createdAt: number }[],
	now: number,
	quietMs = 60_000,
	maxMs = 5 * 60_000
): boolean {
	if (!pending.length) return false;
	const times = pending.map((p) => p.createdAt);
	return now - Math.max(...times) >= quietMs || now - Math.min(...times) >= maxMs;
}

/** A pending edit in a few words, for the list of unsaved edits. */
export function pendingLabel(op: Op): string {
	switch (op.op) {
		case 'add':
			return `add ${op.item.id} ${op.item.title}`;
		case 'remove':
			return `remove ${op.id}`;
		case 'move':
			return `move ${op.id}`;
		case 'edit': {
			const c = op.change;
			const status = c.meta?.find((m) => m.key.toLowerCase() === 'status')?.value;
			const parts = [
				status ? `status ${status}` : null,
				c.title !== undefined ? 'title' : null,
				c.body !== undefined ? 'text' : null,
				c.meta && !status ? 'details' : null
			].filter(Boolean);
			return `edit ${op.id}${parts.length ? ` (${parts.join(', ')})` : ''}`;
		}
	}
}
