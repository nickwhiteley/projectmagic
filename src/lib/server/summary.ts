// The overview card's summary of a project (spec §9).
import { renderInline } from '#lib/core/render.ts';
import type { ProjectState } from '#lib/core/state.ts';

export function summarise(s: ProjectState, now = Date.now()) {
	const counts: Record<string, number> = {};
	for (const it of s.items) counts[it.status] = (counts[it.status] ?? 0) + 1;
	const done14 = s.done.filter((d) => d.at && now - Date.parse(d.at) < 14 * 86_400_000).length;
	const h = s.health;
	const notices =
		h.warnings.length +
		h.dangling.length +
		h.disagreements.length +
		h.unknownTasks.length +
		h.configWarnings.length +
		(h.lastError ? 1 : 0);
	const titleOf = new Map(s.items.map((i) => [i.id, i.titleText]));
	const next = s.plan?.next
		? s.plan.tasks.find((t) => t.number === s.plan!.next && !t.superseded)
		: undefined;
	const group = next ? s.plan!.groups.find((g) => g.title === next.group) : undefined;
	const waiting = s.items.filter(
		(i) => (i.status === 'built' || i.status === 'blocked') && i.waiting
	);
	return {
		repo: s.repo,
		name: s.name,
		lastSyncAt: s.lastSyncAt,
		lastError: h.lastError,
		lastCommit: s.lastCommit,
		hasBacklog: s.hasBacklog,
		notices,
		counts,
		done14,
		inFlight: s.branches
			.filter((b) => b.active && !b.isMain && !b.isEdits && !b.isDeploy)
			.map((b) => ({
				name: b.name,
				ahead: b.ahead,
				behind: b.behind,
				message: b.message,
				committedAt: b.committedAt,
				pr: b.prs.find((p) => p.state === 'OPEN') ?? null,
				items: b.items.map((id) => ({ id, title: titleOf.get(id) ?? '' })),
				tasks: b.tasks,
				inferred: b.inferred ? { id: b.inferred, title: titleOf.get(b.inferred) ?? '' } : null,
				unlinked: b.unlinked && !b.inferred
			})),
		plan:
			group && next
				? {
						group: group.title,
						done: group.done,
						total: group.total,
						next: { number: next.number, titleHtml: renderInline(next.title) }
					}
				: null,
		waiting: waiting.slice(0, 3).map((i) => ({
			id: i.id,
			title: i.titleText,
			status: i.status,
			waitingHtml: renderInline(i.waiting ?? '')
		})),
		waitingCount: waiting.length,
		pending: s.items.filter((i) => i.pending).length
	};
}

export type Summary = ReturnType<typeof summarise>;
