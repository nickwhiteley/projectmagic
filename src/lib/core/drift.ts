// Trust (PM40): items whose status the files and git disagree about, found so a person can ask the
// agent to put them right. Like disagreements (§7.2), they are shown, never resolved: Project Magic
// doesn't change a status because of them.
import { EDIT_BRANCH, parseBranchName } from './branchref.ts';

export type Drift =
	/** In progress, and its branch has had no commit for `hours` (or no branch was ever pushed). */
	| { kind: 'stalled'; hours: number; branch: string | null }
	/** A merged PR names it, nothing was committed since, and it is still in progress or in review. */
	| { kind: 'merged'; pr: number; status: string }
	/** Marked done after work was under way, and no merged PR names it. */
	| { kind: 'unmerged' };

export interface DriftItem {
	id: string;
	status: string;
	/** Linked branches other than main, with their last commit. */
	branches: { name: string; committedAt: string; active: boolean }[];
	/** An open PR is linked: in review is then what it says. */
	openPr: boolean;
}

export interface MergedPr {
	number: number;
	/** When it merged. */
	at: string;
	head: string;
	backlog: string[];
}

export interface StatusChange {
	id: string;
	from: string | null;
	to: string | null;
	at: string;
}

const HOUR = 3_600_000;
/** An agent may merge, then fix the backlog in its next commit: give it this long. */
const GRACE = HOUR;
/** Done items are only checked for a merge this long after they became done. */
const DONE_DAYS = 14;
const UNDER_WAY = new Set(['in progress', 'in review', 'built']);

/** A PR citing more items than this is bookkeeping, such as a backlog tidy, not the work. */
const MAX_CITED = 5;

/** Whether a merged PR shipped the item: its `Backlog:` lines, or its branch's name. Project
 * Magic's own edits and PRs citing many items don't count. */
function names(pr: MergedPr, id: string): boolean {
	if (pr.head === EDIT_BRANCH) return false;
	const lower = id.toLowerCase();
	return (
		(pr.backlog.length <= MAX_CITED && pr.backlog.some((b) => b.toLowerCase() === lower)) ||
		parseBranchName(pr.head)?.ref?.toLowerCase() === lower
	);
}

/** Each item's notices, for those that have any. */
export function drift(
	items: DriftItem[],
	merged: MergedPr[],
	changes: StatusChange[],
	stallHours: number,
	now: number
): Record<string, Drift[]> {
	const out: Record<string, Drift[]> = {};
	const add = (id: string, d: Drift) => (out[id] ??= []).push(d);
	for (const it of items) {
		const mine = merged.filter((p) => names(p, it.id)).sort((a, b) => b.at.localeCompare(a.at));
		const lastCommit = it.branches
			.filter((b) => b.active)
			.sort((a, b) => b.committedAt.localeCompare(a.committedAt))[0];
		const since = changes
			.filter((c) => c.id === it.id && c.to === it.status)
			.sort((a, b) => b.at.localeCompare(a.at))[0];

		if ((it.status === 'in progress' || it.status === 'in review') && !it.openPr) {
			const pr = mine[0];
			const quietSince = lastCommit ? Date.parse(lastCommit.committedAt) : 0;
			if (pr && Date.parse(pr.at) >= quietSince && now - Date.parse(pr.at) > GRACE) {
				add(it.id, { kind: 'merged', pr: pr.number, status: it.status });
				continue;
			}
		}

		if (it.status === 'in progress') {
			const from = lastCommit ? Date.parse(lastCommit.committedAt) : since && Date.parse(since.at);
			if (from && now - from > stallHours * HOUR)
				add(it.id, {
					kind: 'stalled',
					hours: Math.floor((now - from) / HOUR),
					branch: lastCommit?.name ?? null
				});
		}

		if (
			it.status === 'done' &&
			since &&
			UNDER_WAY.has(since.from ?? '') &&
			now - Date.parse(since.at) < DONE_DAYS * 24 * HOUR &&
			!mine.length
		)
			add(it.id, { kind: 'unmerged' });
	}
	return out;
}

/** A short label for a row or a card. */
export function driftLabel(d: Drift): string {
	if (d.kind === 'stalled') return `stalled ${ageText(d.hours)}`;
	if (d.kind === 'merged') return `PR #${d.pr} merged, not moved`;
	return 'done, no merge';
}

/** What is wrong, in a sentence, for the item page. */
export function driftText(d: Drift): string {
	if (d.kind === 'stalled')
		return d.branch
			? `In progress, but \`${d.branch}\` has had no commit for ${ageText(d.hours)}.`
			: `In progress for ${ageText(d.hours)}, with no branch pushed.`;
	if (d.kind === 'merged')
		return `PR #${d.pr}, which names this item, is merged, but the item is still ${d.status}.`;
	return 'Marked done after work was under way, but no merged PR names it.';
}

/** The comment a person can send the agent (PM32), to edit before sending. */
export function driftAsk(id: string, d: Drift): string {
	if (d.kind === 'stalled')
		return d.branch
			? `There has been no commit on \`${d.branch}\` for ${ageText(d.hours)}. Is ${id} still in progress? If it is blocked, set Status: blocked and say what it waits on. If the work stopped, push what you have and say where it got to.`
			: `${id} has been in progress for ${ageText(d.hours)} with no branch pushed. Push the branch, or set ${id} back to todo if the work hasn't started.`;
	if (d.kind === 'merged')
		return `PR #${d.pr} is merged, but ${id} still says ${d.status}. If the work is finished, set Status: built and say what to check. If more is to come, say what is left.`;
	return `${id} is marked done, but no merged PR names it. Which PR shipped it? Add "Backlog: ${id}" to that PR's description. If it hasn't shipped, set the status back and say what is left.`;
}

function ageText(hours: number): string {
	return hours < 48 ? `${hours} hours` : `${Math.floor(hours / 24)} days`;
}
