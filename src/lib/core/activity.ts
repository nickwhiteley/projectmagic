// The activity feed (PM5): what happened lately across projects, grouped by the item it was
// about. It is built from what the sync caches: each active branch's latest commit, and items
// that shipped. (Older commits on a branch aren't cached, so a branch shows once, at its head.)
import type { ProjectState } from './state.ts';

export type ActivityKind = 'commit' | 'shipped';

export interface ActivityEvent {
	kind: ActivityKind;
	at: string;
	text: string;
	branch: string | null;
	pr: number | null;
}

export interface ActivityGroup {
	repo: string;
	project: string;
	/** The item the events are about, or null for work no item links to. */
	itemId: string | null;
	itemTitle: string | null;
	latest: string;
	events: ActivityEvent[];
}

export const WINDOW_DAYS = 14;

export function activity(
	states: ProjectState[],
	now = Date.now(),
	days = WINDOW_DAYS
): ActivityGroup[] {
	const since = now - days * 86_400_000;
	const groups = new Map<string, ActivityGroup>();
	const add = (
		s: ProjectState,
		itemId: string | null,
		itemTitle: string | null,
		e: ActivityEvent
	) => {
		if (Date.parse(e.at) < since) return;
		const key = `${s.repo}\u0000${itemId ?? ''}`;
		let g = groups.get(key);
		if (!g) {
			g = { repo: s.repo, project: s.name, itemId, itemTitle, latest: e.at, events: [] };
			groups.set(key, g);
		}
		g.events.push(e);
		if (e.at > g.latest) g.latest = e.at;
	};

	for (const s of states) {
		const titles = new Map(s.items.map((i) => [i.id, i.titleText]));
		for (const d of s.done) {
			if (!d.at) continue;
			add(s, d.id, d.title.replace(/[*`_]/g, ''), {
				kind: 'shipped',
				at: d.at,
				text: `${d.id} shipped`,
				branch: null,
				pr: d.pr
			});
		}
		for (const b of s.branches) {
			// Project Magic's own edits and deployment branches aren't work.
			if (!b.active || b.isEdits || b.isDeploy) continue;
			const itemId = b.items[0] ?? null;
			add(s, itemId, itemId ? (titles.get(itemId) ?? null) : null, {
				kind: 'commit',
				at: b.committedAt,
				text: b.message,
				branch: b.name,
				pr: b.prs[0]?.number ?? null
			});
		}
	}
	for (const g of groups.values()) g.events.sort((a, b) => b.at.localeCompare(a.at));
	return [...groups.values()].sort((a, b) => b.latest.localeCompare(a.latest));
}
