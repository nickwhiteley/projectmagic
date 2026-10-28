// Spike 0.3 (PM65), step 2: review each item as first written, and the controls, with the model
// the app is configured with (.env), a few times each to see whether the light holds still.
// Usage: node spikes/0.3-ticket-clarity/run.ts [--runs 2] [--model name] [--only PM4,C1]
// Reads out/items.json (collect.ts); writes out/results.json and out/sheet.md.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { completer, modelFromEnv } from '../../src/lib/server/models.ts';
import { light, parseReview, ticketPrompt, type Light, type Review, type Ticket } from './clarity.ts';
import type { Collected } from './collect.ts';

const { values: args } = parseArgs({
	options: {
		runs: { type: 'string', default: '2' },
		model: { type: 'string' },
		only: { type: 'string' },
		temperature: { type: 'string' }
	}
});
if (existsSync('.env')) process.loadEnvFile('.env');
const env = process.env;
const cfg = modelFromEnv({
	provider: env.INFERENCE_PROVIDER,
	model: args.model ?? env.INFERENCE_MODEL,
	baseUrl: env.INFERENCE_BASE_URL || undefined,
	apiKey: env.INFERENCE_API_KEY || undefined
});
if (!cfg) throw new Error('No model: set INFERENCE_PROVIDER and the rest in .env');
// The app sets no temperature; --temperature adds one to each request (Ollama and OpenAI only).
const temperature = args.temperature === undefined ? undefined : Number(args.temperature);
const withTemperature: typeof fetch = (url, init) => {
	if (temperature === undefined || typeof init?.body !== 'string') return fetch(url, init);
	const body = JSON.parse(init.body);
	if (cfg.provider === 'ollama') body.options = { ...body.options, temperature };
	else body.temperature = temperature;
	return fetch(url, { ...init, body: JSON.stringify(body) });
};
const complete = completer(cfg, withTemperature);

const PROJECT =
	'Project Magic, a SvelteKit web app over Postgres that reads the markdown backlogs (backlog.md, ' +
	'bugs.md), plans (PROGRESS.md) and docs that AI coding agents keep in GitHub repositories, shows ' +
	'every project on one dashboard (a home page of project cards; per project a List, a Board, an ' +
	'Epics tab, the plan and the docs), and edits the backlog by committing to the repository. Its ' +
	'spec.md is the full specification.';

const here = (f: string) => new URL(f, import.meta.url);
type Row = Ticket & { expect?: Light; revisions?: number };
const collected: Collected[] = JSON.parse(readFileSync(here('out/items.json'), 'utf8'));
const controls: Row[] = JSON.parse(readFileSync(here('controls.json'), 'utf8'));
const only = args.only?.split(',');
const rows: Row[] = [
	...controls,
	...collected.filter((c) => !/^(done|built)/i.test(c.firstStatus ?? ''))
].filter((r) => !only || only.includes(r.id));

interface Result {
	id: string;
	reviews: (Review & { light: Light })[];
	unreadable: number;
	tokens: number;
	ms: number;
}

const runs = Number(args.runs);
async function review(row: Row): Promise<Result> {
	const p = ticketPrompt(row, PROJECT);
	const res: Result = { id: row.id, reviews: [], unreadable: 0, tokens: 0, ms: 0 };
	for (let i = 0; i < runs; i++) {
		const t0 = Date.now();
		const c = await complete(p.system, p.user, { maxTokens: 1500 });
		res.ms += Date.now() - t0;
		res.tokens += c.tokens;
		const r = parseReview(c.text);
		if (r) res.reviews.push({ ...r, light: light(r, row) });
		else res.unreadable++;
	}
	return res;
}

// A few at a time, in order.
const results: Result[] = [];
const queue = [...rows];
await Promise.all(
	Array.from({ length: 4 }, async () => {
		for (let row = queue.shift(); row; row = queue.shift()) {
			try {
				const r = await review(row);
				results.push(r);
				console.log(`${row.id.padEnd(5)} ${r.reviews.map((x) => x.light).join(' ')}`);
			} catch (e) {
				console.log(`${row.id.padEnd(5)} failed: ${(e as Error).message}`);
			}
		}
	})
);
const byId = new Map(results.map((r) => [r.id, r]));
writeFileSync(
	here('out/results.json'),
	JSON.stringify({ model: `${cfg.provider} ${cfg.model}`, temperature, runs, results }, null, '\t')
);

// The sheet: one row per item, with an empty column for a person's own light.
const dot: Record<Light, string> = { green: '🟢', amber: '🟠', red: '🔴' };
const cell = (s: string) => s.replace(/\|/g, '\\|').replace(/\n/g, ' ');
const lines = [
	`Model: ${cfg.provider} ${cfg.model}, temperature ${temperature ?? 'default'}, ${runs} runs each. Put your own light (g, a or r) in *Yours*.`,
	'',
	'| Id | Title | Size | Model | Yours | Revised | Blocking guesses (first run) |',
	'| --- | --- | --- | --- | --- | --- | --- |'
];
for (const row of rows) {
	const r = byId.get(row.id);
	const lights = r?.reviews.map((x) => dot[x.light]).join('') ?? 'failed';
	const blocking =
		r?.reviews[0]?.guesses
			.filter((g) => g.blocking)
			.map((g) => g.guess)
			.join('; ') ?? '';
	const yours = row.expect ? `(${row.expect[0]})` : '';
	lines.push(
		`| ${row.id} | ${cell(row.title)} | ${row.size ?? ''} | ${lights} | ${yours} | ${row.revisions ?? ''} | ${cell(blocking)} |`
	);
}
writeFileSync(here('out/sheet.md'), lines.join('\n') + '\n');

const all = results.flatMap((r) => r.reviews);
const steady = results.filter((r) => new Set(r.reviews.map((x) => x.light)).size === 1).length;
const tokens = results.reduce((n, r) => n + r.tokens, 0);
const ms = results.reduce((n, r) => n + r.ms, 0);
console.log(
	`\n${results.length} items, ${all.length} reviews, ${results.reduce((n, r) => n + r.unreadable, 0)} unreadable; ` +
		`same light every run: ${steady}/${results.length}; ` +
		`${Math.round(tokens / Math.max(all.length, 1))} tokens and ${(ms / Math.max(all.length, 1) / 1000).toFixed(1)} s a review`
);
for (const l of ['green', 'amber', 'red'] as Light[])
	console.log(`${dot[l]} ${all.filter((x) => x.light === l).length}`);
