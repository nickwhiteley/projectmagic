// A project's delivery figures (PM9, spec §16): the stored events and the current state, through
// the pure functions in core/delivery.ts. Before the migration the table is missing, which reads
// as no events.
import { parseBacklog } from '#lib/core/backlog.ts';
import { evidenceFor, type Evidence } from '#lib/core/evidence.ts';
import {
	delivery,
	isoOf,
	type DeployEvent,
	type PrEvent,
	type RunEvent,
	type StatusEvent
} from '#lib/core/delivery.ts';
import type { ProjectState } from '#lib/core/state.ts';
import { db } from './db.ts';

const WINDOW_DAYS = 120;

interface EventRow {
	kind: string;
	key: string;
	at: Date;
	sha: string | null;
	data: Record<string, unknown>;
}

export async function loadEvents(projectId: string) {
	const rows = await db()<EventRow[]>`
		select kind, key, at, sha, data from event
		where project_id = ${projectId}
		and (kind = 'status' or at > now() - ${`${WINDOW_DAYS} days`}::interval)
		order by at`.catch((e: { code?: string }) => {
		if (e?.code === '42P01') return [] as EventRow[];
		throw e;
	});
	const deploys: DeployEvent[] = [];
	const prs: PrEvent[] = [];
	const runs: RunEvent[] = [];
	const changes: StatusEvent[] = [];
	for (const r of rows) {
		const d = r.data as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
		const at = r.at.toISOString();
		if (r.kind === 'deploy')
			deploys.push({ id: r.key, at, sha: r.sha ?? '', environment: d.environment, state: d.state });
		else if (r.kind === 'pr')
			prs.push({
				number: Number(r.key),
				title: d.title,
				at,
				sha: r.sha,
				createdAt: d.createdAt,
				firstCommitAt: d.firstCommitAt,
				head: d.head,
				bug: !!d.bug,
				backlog: d.backlog ?? [],
				url: d.url,
				evidence: d.evidence ?? null
			});
		else if (r.kind === 'run')
			runs.push({
				id: r.key,
				at,
				sha: r.sha ?? '',
				conclusion: d.conclusion,
				started: d.started !== false
			});
		else if (r.kind === 'status') changes.push({ id: d.id, from: d.from, to: d.to, at });
	}
	return { deploys, prs, runs, changes };
}

export async function loadDelivery(s: ProjectState, projectId: string, now = Date.now()) {
	const events = await loadEvents(projectId);
	const raised = new Map<string, string>();
	for (const i of s.items) {
		const iso = isoOf(i.raised);
		if (iso) raised.set(i.id, iso);
	}
	const shipped = s.done
		.filter((d) => !d.unpruned && d.at)
		.map((d) => {
			const meta = parseBacklog(d.body).items[0]?.meta;
			const iso = isoOf(meta?.raised);
			if (iso && !raised.has(d.id)) raised.set(d.id, iso);
			return { id: d.id, at: d.at!, size: meta?.size ?? null };
		});
	// The evidence on each built item (PM39), from the merged PR that names it.
	const evidence: Record<string, Evidence> = {};
	for (const i of s.items)
		if (i.status === 'built') evidence[i.id] = evidenceFor({ id: i.id, body: i.body }, events.prs);
	return {
		has: events.deploys.length + events.prs.length + events.runs.length > 0,
		evidence,
		...delivery({
			...events,
			shipped,
			items: s.items.map((i) => ({
				id: i.id,
				title: i.titleText,
				status: i.status,
				waiting: i.waiting,
				assignee: i.assignee
			})),
			raisedOf: (id) => raised.get(id) ?? null,
			now
		})
	};
}

export type DeliveryView = Awaited<ReturnType<typeof loadDelivery>>;

/** The one line on an overview card (spec §16.5): four figures, each a link on the card. */
export function cardLine(d: DeliveryView) {
	return {
		has: d.has || d.founder.length > 0,
		deploysThisWeek: d.deploysThisWeek,
		leadTimeHours: d.leadTimeHours,
		bugs: d.failure.count,
		queue: d.founder.length,
		evidence: d.evidence
	};
}
