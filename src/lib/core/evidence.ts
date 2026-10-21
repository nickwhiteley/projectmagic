// The evidence on a built item (PM39): what a person needs to accept it without leaving the page.
// The merged PR that names the item, its diff size, its CI and its preview deployment (all read by
// the delivery sync and kept on the PR's event), and the item's acceptance criteria.

/** What the sync keeps on a merged PR's event. */
export interface PrEvidence {
	additions: number;
	deletions: number;
	files: number;
	/** The PR's head commit's CI: null when no workflow ran on it. */
	ci: 'success' | 'failure' | 'pending' | null;
	/** The preview deployment's URL for the head commit, or null. */
	preview: string | null;
}

export interface Evidence extends Partial<PrEvidence> {
	pr: { number: number; url: string | null } | null;
	/** Task-list lines in the item's body: `- [x]` ticked of all. */
	criteria: { done: number; total: number } | null;
}

/** A workflow run on the head commit, as the Actions API lists it. */
export interface HeadRun {
	status: string;
	conclusion: string | null;
	/** False when a failed run's jobs ran no steps (as when Actions billing fails, §16.1). */
	started: boolean;
}

/** Runs that never started are left out; any failure fails, anything unfinished is pending. */
export function ciSummary(runs: HeadRun[]): PrEvidence['ci'] {
	const counted = runs.filter((r) => r.started);
	if (!counted.length) return null;
	if (counted.some((r) => ['failure', 'timed_out', 'startup_failure'].includes(r.conclusion ?? '')))
		return 'failure';
	if (counted.some((r) => r.status !== 'completed')) return 'pending';
	return 'success';
}

/** The URL a deployment's statuses (newest first) give, from the newest that has one. */
export function deploymentUrl(
	statuses: { state: string; environment_url?: string | null; target_url?: string | null }[]
): string | null {
	for (const s of statuses) {
		const url = s.environment_url || (s.state === 'success' ? s.target_url : null);
		if (url && /^https:\/\//.test(url)) return url;
	}
	return null;
}

/** `- [ ]` and `- [x]` lines outside code: the item's acceptance criteria, or null if none. */
export function criteria(body: string): Evidence['criteria'] {
	let done = 0;
	let total = 0;
	let fence = false;
	for (const line of body.split('\n')) {
		if (/^\s*(```|~~~)/.test(line)) fence = !fence;
		if (fence) continue;
		const m = line.match(/^\s*[-*+] \[([ xX])\] /);
		if (!m) continue;
		total++;
		if (m[1] !== ' ') done++;
	}
	return total ? { done, total } : null;
}

/** The newest merged PR naming the item with `Backlog:`, with what the sync found for it. */
export function evidenceFor(
	item: { id: string; body: string },
	prs: {
		number: number;
		at: string;
		backlog: string[];
		url?: string;
		evidence?: PrEvidence | null;
	}[]
): Evidence {
	const id = item.id.toLowerCase();
	const pr = prs
		.filter((p) => p.backlog.some((b) => b.toLowerCase() === id))
		.sort((a, b) => b.at.localeCompare(a.at))[0];
	return {
		pr: pr ? { number: pr.number, url: pr.url ?? null } : null,
		...(pr?.evidence ?? {}),
		criteria: criteria(item.body)
	};
}

// The daily digest (PM39), as a Slack message: what waits on a person, project by project.

export interface DigestItem {
	id: string;
	title: string;
	/** `built`, `blocked`, or `reply` for an agent's reply waiting to be read. */
	kind: 'built' | 'blocked' | 'reply';
	waiting: string | null;
	days: number | null;
	url: string;
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const KIND = { built: 'to check', blocked: 'blocked', reply: 'agent replied' } as const;

/** The message, or null when nothing waits: an empty digest is never sent. */
export function digestMessage(
	projects: { name: string; url: string; items: DigestItem[] }[]
): { text: string } | null {
	const withItems = projects.filter((p) => p.items.length);
	if (!withItems.length) return null;
	const total = withItems.reduce((n, p) => n + p.items.length, 0);
	const lines = [`*${total} waiting on you* in Project Magic`];
	for (const p of withItems) {
		lines.push('', `*<${p.url}|${esc(p.name)}>*`);
		for (const i of p.items) {
			const age = i.days === null ? '' : i.days === 0 ? ', today' : `, ${i.days}d`;
			const why = i.waiting && i.kind !== 'reply' ? ` — ${esc(i.waiting)}` : '';
			lines.push(`• <${i.url}|${esc(i.id)}> ${esc(i.title)} (${KIND[i.kind]}${age})${why}`);
		}
	}
	return { text: lines.join('\n') };
}

/** Whether a URL is a Slack incoming webhook: https on hooks.slack.com, under /services/. */
export function slackWebhookProblem(url: string): string | null {
	try {
		const u = new URL(url.trim());
		if (
			u.protocol === 'https:' &&
			u.hostname === 'hooks.slack.com' &&
			u.pathname.startsWith('/services/')
		)
			return null;
	} catch {
		// falls through
	}
	return 'should be a Slack incoming webhook URL, starting https://hooks.slack.com/services/';
}
