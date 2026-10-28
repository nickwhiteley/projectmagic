// Spike 0.3 (PM65): is a backlog item clear enough to build and check? The model does the
// builder's job (says what it would build, how it would check it, and what it had to guess) and
// the light follows from that by a fixed rule, so the model never gives a score.

export interface Ticket {
	id: string;
	title: string;
	body: string;
	size: string | null;
	type: string | null;
	for: string | null;
}

export interface Guess {
	guess: string;
	/** A different guess would give a different change. */
	blocking: boolean;
}

export interface Check {
	check: string;
	/** Passes or fails without anyone's judgement. */
	concrete: boolean;
}

export interface Review {
	restatement: string;
	checks: Check[];
	guesses: Guess[];
	/** The ticket says why the change is wanted. */
	why: boolean;
}

export type Light = 'green' | 'amber' | 'red';

const MAX_BODY = 6000;

export const SYSTEM_PROMPT = `You are about to build one item from a software project's backlog. Before you start, read it as the developer who will build it and the reviewer who will check the change.

Answer with a single JSON object and nothing else:
{"restatement": "...", "checks": [{"check": "...", "concrete": true}], "guesses": [{"guess": "...", "blocking": true}], "why": true}

- "restatement": what you would build, in two or three plain sentences. Be specific: name what changes and where.
- "checks": how a reviewer would know the change is done and right, each one a test or an observation. "concrete" is true when it passes or fails without anyone's judgement (an element has a colour, a request returns 404, a page lists X), false when it needs opinion ("looks better", "is clearer", "works well").
- "guesses": every decision the item leaves to you that you would have to make up: what it means, where it goes, how it behaves, what is in or out of scope. "blocking" is true only when the text supports two or more readings that would give materially different changes and nothing in it favours one, so the writer could well reject what you build. When one reading is clearly the most natural, take it: that is not a guess at all, so leave it out. "blocking" is false for a choice where any reasonable answer would do. Don't list ordinary engineering choices a competent developer makes without asking (names, how to structure the code, how to find the cause of a described bug), and don't invent doubts the text already settles.
- "why": true when the item says, or makes obvious, why the change is wanted.

Judge only what is written. Length is not clarity: a one-line item that names the element, the place and the result is clear; a long item that never settles what should happen is not. Small items need less: a small fix doesn't need a reason. Referring to the project's own documents, conventions or earlier items by name is fine; assume the builder can read them.`;

/** A sentence or two about the project, so names like "the Board" aren't counted as guesses. */
export function ticketPrompt(t: Ticket, project: string): { system: string; user: string } {
	const body = t.body.length > MAX_BODY ? `${t.body.slice(0, MAX_BODY)}\n…` : t.body;
	const meta = [
		t.size && `Size: ${t.size}`,
		t.type && `Type: ${t.type}`,
		t.for && `For: ${t.for}`
	].filter(Boolean);
	return {
		system: SYSTEM_PROMPT,
		user: [
			`The project: ${project}`,
			'',
			`### ${t.id} ${t.title}`,
			meta.length ? `**${meta.join(' · ')}**` : '',
			'',
			body || '(no description)'
		].join('\n')
	};
}

const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');

/** The first JSON object in a reply as a review; null if it makes no sense. */
export function parseReview(reply: string): Review | null {
	const start = reply.indexOf('{');
	const end = reply.lastIndexOf('}');
	if (start < 0 || end <= start) return null;
	let o: Record<string, unknown>;
	try {
		o = JSON.parse(reply.slice(start, end + 1));
	} catch {
		return null;
	}
	if (!o || typeof o !== 'object' || !str(o.restatement)) return null;
	const list = (v: unknown) => (Array.isArray(v) ? v : []) as Record<string, unknown>[];
	return {
		restatement: str(o.restatement),
		checks: list(o.checks)
			.map((c) => ({ check: str(c?.check), concrete: c?.concrete === true }))
			.filter((c) => c.check),
		guesses: list(o.guesses)
			.map((g) => ({ guess: str(g?.guess), blocking: g?.blocking === true }))
			.filter((g) => g.guess),
		why: o.why === true
	};
}

/** Bigger work, and features, need a reason; S and XS bugs and chores don't. */
export function needsWhy(t: Pick<Ticket, 'size' | 'type'>): boolean {
	const small = /^(XS|S)$/i.test(t.size ?? '');
	return !small || /feature/i.test(t.type ?? '');
}

/** Blocking guesses that make an item red rather than amber. */
export const BLOCKING_RED = 2;

export function light(r: Review, t: Pick<Ticket, 'size' | 'type'>): Light {
	const concrete = r.checks.filter((c) => c.concrete).length;
	const blocking = r.guesses.filter((g) => g.blocking).length;
	if (blocking >= BLOCKING_RED || concrete === 0) return 'red';
	// Minor guesses are shown but don't count: by definition any answer to them will do, and the
	// model lists two or three for almost every item.
	if (blocking > 0 || concrete * 2 < r.checks.length || (needsWhy(t) && !r.why)) return 'amber';
	return 'green';
}
