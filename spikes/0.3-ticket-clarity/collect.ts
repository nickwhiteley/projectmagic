// Spike 0.3 (PM65), step 1: every item as it was first written, from the history of main.
// Usage: node spikes/0.3-ticket-clarity/collect.ts [repo dir]   (default: this repository)
// Writes out/items.json. An item's first version is the nearest thing to the ticket as saved,
// before anyone built it; later revisions are counted, as a hint at how it went.
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { parseBacklog } from '../../src/lib/core/backlog.ts';

const repo = process.argv[2] ?? '.';
const FILES = ['backlog.md', 'bugs.md'];
const git = (...args: string[]) =>
	execFileSync('git', ['-C', repo, ...args], {
		encoding: 'utf8',
		maxBuffer: 64 << 20,
		stdio: ['ignore', 'pipe', 'ignore']
	});

export interface Collected {
	id: string;
	title: string;
	/** The body as first written, without its meta line or any "Built" notes. */
	body: string;
	size: string | null;
	type: string | null;
	for: string | null;
	/** The status it had when it first appeared. */
	firstStatus: string | null;
	firstSeen: string;
	/** How many times the ticket's text changed afterwards, Built notes aside. */
	revisions: number;
	lastStatus: string | null;
}

/** The ticket without what was written after building it. */
export function ticketText(body: string): string {
	const cut = body.search(/^\*{0,2}Built\b/m);
	return (cut < 0 ? body : body.slice(0, cut)).trim();
}

const entry = (meta: { entries: { key: string; value: string }[] } | null, key: string) =>
	meta?.entries.find((e) => e.key.toLowerCase() === key)?.value ?? null;

const commits = git('log', '--reverse', '--format=%H %cs', 'main', '--', ...FILES)
	.trim()
	.split('\n')
	.map((l) => l.split(' ') as [string, string]);

const items = new Map<string, Collected & { last: string }>();
for (const [sha, date] of commits) {
	for (const file of FILES) {
		let text: string;
		try {
			text = git('show', `${sha}:${file}`);
		} catch {
			continue; // not in this commit
		}
		for (const it of parseBacklog(text).items) {
			const body = ticketText(it.body);
			const seen = items.get(it.id);
			if (!seen) {
				items.set(it.id, {
					id: it.id,
					title: it.titleText,
					body,
					size: it.meta?.size ?? null,
					type: it.meta?.type ?? null,
					for: entry(it.meta, 'for'),
					firstStatus: it.meta?.statusRaw ?? null,
					firstSeen: date,
					revisions: 0,
					lastStatus: it.meta?.statusRaw ?? null,
					last: body
				});
				continue;
			}
			if (body !== seen.last) {
				seen.revisions++;
				seen.last = body;
			}
			seen.lastStatus = it.meta?.statusRaw ?? null;
		}
	}
}

const out = [...items.values()].map(({ last: _, ...c }) => c);
mkdirSync(new URL('out/', import.meta.url), { recursive: true });
writeFileSync(new URL('out/items.json', import.meta.url), JSON.stringify(out, null, '\t'));
const tickets = out.filter((c) => !/^(done|built)$/i.test(c.firstStatus ?? ''));
console.log(
	`${commits.length} commits, ${out.length} items, ${tickets.length} first written as open work`
);
