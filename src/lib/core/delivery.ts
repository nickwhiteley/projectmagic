// Delivery and quality (PM9, spec §16): how fast a project moves and how often it breaks
// production, from events read from GitHub. Pure functions of the events, so every figure can be
// recomputed and tested. Honest numbers (§16.3): a rate is only given when its denominator is at
// least 10, and the rest are counts.

export const EDITS_PR_TITLE = 'Project Magic edits';
const DAY = 86_400_000;
const HOUR = 3_600_000;

export interface DeployEvent {
	id: string;
	at: string;
	sha: string;
	environment: string;
	/** GitHub's latest deployment status: success, failure, error, inactive, pending, ... */
	state: string;
}

export interface PrEvent {
	number: number;
	title: string;
	/** When it merged. */
	at: string;
	/** The merge commit on main. */
	sha: string | null;
	createdAt: string;
	firstCommitAt: string | null;
	head: string;
	/** The body says `Bug: production` (spec §5.3). */
	bug: boolean;
	/** Item ids the body cites with `Backlog:`. */
	backlog: string[];
	url?: string;
}

export interface RunEvent {
	id: string;
	at: string;
	sha: string;
	/** success, failure, cancelled, ... */
	conclusion: string;
	/** False when no job ran a step, as when Actions billing fails: not a failure (§16.1). */
	started: boolean;
}

export interface StatusEvent {
	id: string;
	from: string | null;
	to: string | null;
	at: string;
}

/** `2026-10-14 09:30` and the like as an ISO time (UTC when no zone is written), or null. */
export function isoOf(raw: string | null | undefined): string | null {
	const t = (raw ?? '').replace(/[*`]/g, '').trim();
	if (!t) return null;
	const zoned = /(?:Z|[+-]\d\d:?\d\d)$/i.test(t);
	const ms = Date.parse(zoned ? t : `${t.replace(' ', 'T')}${t.length <= 10 ? 'T00:00' : ''}Z`);
	return Number.isNaN(ms) ? null : new Date(ms).toISOString();
}

/** What the body of a PR says (spec §5.3). */
export function prFacts(body: string | null): { bug: boolean; backlog: string[] } {
	const text = body ?? '';
	const bug = /^\s*Bug:\s*production\b/im.test(text);
	const ids = new Set<string>();
	for (const m of text.matchAll(/^\s*Backlog:\s*(.+)$/gim))
		for (const id of m[1].split(/[\s,]+/))
			if (/^[A-Za-z]{1,4}[0-9]+[a-z]?$|^[0-9]+(\.[0-9]+)*[a-z]?$/.test(id)) ids.add(id);
	return { bug, backlog: [...ids] };
}

/** The Monday (UTC) of the week a time falls in, as a date. */
export function weekOf(at: number | string): string {
	const d = new Date(typeof at === 'string' ? Date.parse(at) : at);
	const monday =
		Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - ((d.getUTCDay() + 6) % 7) * DAY;
	return new Date(monday).toISOString().slice(0, 10);
}

export interface WeekPoint {
	week: string;
	value: number;
	/** The mean of this and the three weeks before it. */
	rolling: number;
}

/** `weeks` weekly totals ending with the week of `now`, with a 4-week rolling mean. */
export function weekly(
	events: { at: string; weight?: number }[],
	now: number,
	weeks = 12
): WeekPoint[] {
	const first = Date.parse(weekOf(now)) - (weeks - 1) * 7 * DAY;
	const keys = Array.from({ length: weeks + 3 }, (_, i) =>
		weekOf(first - 3 * 7 * DAY + i * 7 * DAY)
	);
	const totals = new Map(keys.map((k) => [k, 0]));
	for (const e of events) {
		const k = weekOf(e.at);
		if (totals.has(k)) totals.set(k, totals.get(k)! + (e.weight ?? 1));
	}
	return keys.slice(3).map((week, i) => {
		const window = keys.slice(i, i + 4).map((k) => totals.get(k)!);
		return {
			week,
			value: totals.get(week)!,
			rolling: window.reduce((a, b) => a + b, 0) / 4
		};
	});
}

export const median = (xs: number[]): number | null => {
	if (!xs.length) return null;
	const s = [...xs].sort((a, b) => a - b);
	const m = s.length >> 1;
	return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/** Deploys that changed what runs: successful, and not the squash commit of a Project Magic edit. */
export function realDeploys(deploys: DeployEvent[], prs: PrEvent[]): DeployEvent[] {
	const edits = new Set(prs.filter((p) => p.title === EDITS_PR_TITLE && p.sha).map((p) => p.sha));
	return deploys
		.filter((d) => d.state === 'success' && !edits.has(d.sha))
		.sort((a, b) => a.at.localeCompare(b.at));
}

/** The first real deploy at or after a time (or exactly at the commit, if one is for it). */
function deployFor(pr: PrEvent, deploys: DeployEvent[]): DeployEvent | null {
	const exact = pr.sha ? deploys.find((d) => d.sha === pr.sha) : undefined;
	if (exact) return exact;
	return deploys.find((d) => d.at >= pr.at) ?? null;
}

export interface Timed {
	pr: PrEvent;
	deploy: DeployEvent;
	/** Hours. */
	hours: number;
}

/** Merged PR to the production deploy that carries it, for PRs that have one (§16.1). */
export function leadTimes(prs: PrEvent[], deploys: DeployEvent[]): Timed[] {
	const real = realDeploys(deploys, prs);
	return prs
		.filter((p) => p.title !== EDITS_PR_TITLE && p.firstCommitAt)
		.flatMap((pr) => {
			const deploy = deployFor(pr, real);
			if (!deploy) return [];
			return [
				{ pr, deploy, hours: (Date.parse(deploy.at) - Date.parse(pr.firstCommitAt!)) / HOUR }
			];
		})
		.filter((t) => t.hours >= 0);
}

export interface Restore {
	pr: PrEvent;
	/** Where the clock started: the item's Raised date, or the fix branch's first commit. */
	from: string;
	fromKind: 'raised' | 'first commit';
	deploy: DeployEvent | null;
	hours: number | null;
}

/** Production bug-fix PRs and how long each took from being raised to being deployed (§16.4). */
export function restores(
	prs: PrEvent[],
	deploys: DeployEvent[],
	raisedOf: (id: string) => string | null
): Restore[] {
	const real = realDeploys(deploys, prs);
	return prs
		.filter((p) => p.bug)
		.map((pr) => {
			const raised = pr.backlog.map(raisedOf).find((r): r is string => !!r);
			const from = raised ?? pr.firstCommitAt ?? pr.createdAt;
			const deploy = deployFor(pr, real);
			const hours = deploy ? (Date.parse(deploy.at) - Date.parse(from)) / HOUR : null;
			return {
				pr,
				from,
				fromKind: raised ? ('raised' as const) : ('first commit' as const),
				deploy,
				hours: hours !== null && hours >= 0 ? hours : null
			};
		})
		.sort((a, b) => b.pr.at.localeCompare(a.pr.at));
}

export interface Rate {
	count: number;
	of: number;
	/** Only when `of` is at least 10 (§16.3). */
	rate: number | null;
}

/** Production bug-fix PRs over real production deploys, in the four weeks to `now`. */
export function changeFailure(prs: PrEvent[], deploys: DeployEvent[], now: number): Rate {
	const since = new Date(now - 28 * DAY).toISOString();
	const of = realDeploys(deploys, prs).filter((d) => d.at >= since).length;
	const count = prs.filter((p) => p.bug && p.at >= since).length;
	return { count, of, rate: of >= 10 ? count / of : null };
}

/** Item size as a weight: S = 1, M = 3, L = 8; a range takes the midpoint (§16.1). */
export function sizeWeight(size: string | null | undefined): number {
	const weights: Record<string, number> = { S: 1, M: 3, L: 8 };
	const parts = (size ?? '')
		.toUpperCase()
		.split(/[–—-]/)
		.map((p) => weights[p.trim()])
		.filter((w): w is number => w !== undefined);
	return parts.length ? parts.reduce((a, b) => a + b, 0) / parts.length : 3;
}

export interface Founder {
	id: string;
	title: string;
	status: string;
	waiting: string | null;
	/** Since it entered this status, or null when history doesn't say. */
	since: string | null;
	days: number | null;
}

/** Items `built` or `blocked` that wait on a person, with how long each has waited, oldest first. */
export function founderQueue(
	items: {
		id: string;
		title: string;
		status: string;
		waiting: string | null;
		assignee: string | null;
	}[],
	changes: StatusEvent[],
	now: number
): Founder[] {
	return items
		.filter(
			(i) =>
				(i.status === 'built' || i.status === 'blocked') &&
				(i.waiting || i.assignee?.startsWith('person'))
		)
		.map((i) => {
			const since =
				changes
					.filter((c) => c.id === i.id && c.to === i.status)
					.sort((a, b) => b.at.localeCompare(a.at))[0]?.at ?? null;
			return {
				id: i.id,
				title: i.title,
				status: i.status,
				waiting: i.waiting,
				since,
				days: since ? Math.floor((now - Date.parse(since)) / DAY) : null
			};
		})
		.sort((a, b) => (b.days ?? -1) - (a.days ?? -1));
}

export interface ItemTime {
	id: string;
	/** Days. */
	lead: number;
	cycle: number | null;
}

/** For shipped items: first appearing to done (lead), and first `in progress` to done (cycle). */
export function itemTimes(
	changes: StatusEvent[],
	shipped: { id: string; at: string }[]
): ItemTime[] {
	return shipped.flatMap((s) => {
		const mine = changes.filter((c) => c.id === s.id).sort((a, b) => a.at.localeCompare(b.at));
		const appeared = mine.find((c) => c.from === null);
		if (!appeared) return [];
		const started = mine.find((c) => c.to === 'in progress');
		const days = (from: string) => (Date.parse(s.at) - Date.parse(from)) / DAY;
		return [{ id: s.id, lead: days(appeared.at), cycle: started ? days(started.at) : null }];
	});
}

export interface Health {
	runs: number;
	failed: number;
	/** Runs whose jobs never started: left out, and the gap is shown. */
	unstarted: number;
	/** Failed share of the runs that started, when there are at least 10. */
	failRate: number | null;
	/** Hours main has been red now, or null if it isn't. */
	redNow: number | null;
	/** The longest red stretch in the window, hours. */
	longestRed: number | null;
}

/** Main's CI in the four weeks to `now`. */
export function mainHealth(runs: RunEvent[], now: number): Health {
	const since = new Date(now - 28 * DAY).toISOString();
	const inWindow = runs.filter((r) => r.at >= since).sort((a, b) => a.at.localeCompare(b.at));
	const started = inWindow.filter((r) => r.started && r.conclusion !== 'cancelled');
	const failed = started.filter((r) => r.conclusion === 'failure');
	let redSince: string | null = null;
	let longest = 0;
	for (const r of started) {
		if (r.conclusion === 'failure') redSince ??= r.at;
		else if (r.conclusion === 'success' && redSince) {
			longest = Math.max(longest, Date.parse(r.at) - Date.parse(redSince));
			redSince = null;
		}
	}
	const redNow = redSince ? now - Date.parse(redSince) : null;
	if (redNow !== null) longest = Math.max(longest, redNow);
	return {
		runs: started.length,
		failed: failed.length,
		unstarted: inWindow.filter((r) => !r.started).length,
		failRate: started.length >= 10 ? failed.length / started.length : null,
		redNow: redNow === null ? null : redNow / HOUR,
		longestRed: longest ? longest / HOUR : null
	};
}

export interface DeliveryInput {
	deploys: DeployEvent[];
	prs: PrEvent[];
	runs: RunEvent[];
	changes: StatusEvent[];
	shipped: { id: string; at: string; size: string | null }[];
	items: Parameters<typeof founderQueue>[0];
	raisedOf: (id: string) => string | null;
	now: number;
}

export function delivery(i: DeliveryInput) {
	const real = realDeploys(i.deploys, i.prs);
	const lead = leadTimes(i.prs, i.deploys);
	const since4 = new Date(i.now - 28 * DAY).toISOString();
	const times = itemTimes(i.changes, i.shipped);
	const recentTimes = times.filter((t) => {
		const s = i.shipped.find((x) => x.id === t.id)!;
		return s.at >= since4;
	});
	const restoreList = restores(i.prs, i.deploys, i.raisedOf);
	return {
		deploysPerWeek: weekly(real, i.now),
		realDeploys: real.length,
		editDeploysLeftOut: i.deploys.filter((d) => d.state === 'success').length - real.length,
		deploysThisWeek: real.filter((d) => weekOf(d.at) === weekOf(i.now)).length,
		leadTimeHours: median(lead.filter((t) => t.deploy.at >= since4).map((t) => t.hours)),
		leadTimes: lead,
		failure: changeFailure(i.prs, i.deploys, i.now),
		restores: restoreList,
		medianRestoreHours: median(
			restoreList.filter((r) => r.hours !== null).map((r) => r.hours as number)
		),
		throughput: weekly(
			i.shipped.map((s) => ({ at: s.at, weight: sizeWeight(s.size) })),
			i.now
		),
		leadDays: median(recentTimes.map((t) => t.lead)),
		cycleDays: median(recentTimes.flatMap((t) => (t.cycle === null ? [] : [t.cycle]))),
		itemsTimed: recentTimes.length,
		founder: founderQueue(i.items, i.changes, i.now),
		health: mainHealth(i.runs, i.now)
	};
}

export type Delivery = ReturnType<typeof delivery>;
