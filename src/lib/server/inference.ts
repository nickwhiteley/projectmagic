// Inferred status (PM3): propose a status for each item with no meta line, within a daily token
// limit, and cache the proposal against the item's text. A project can opt out with
// `inference: false` in .projectmagic.yml, which stands in for a tenant's opt-out until PM20; a
// person can hide the proposals from their own views (user_pref).
import {
	INFERENCE_API_KEY,
	INFERENCE_BASE_URL,
	INFERENCE_MODEL,
	INFERENCE_PROVIDER
} from '$app/env/private';
import { inferencePrompt, parseInference, type Inferred } from '#lib/core/inference.ts';
import { db } from './db.ts';
import { completer, modelFromEnv, type Complete } from './models.ts';
import { loadProjectState } from './project-state.ts';
import { aiAllowed, planOf, usageOf } from './plans.ts';
import { startJob } from './ops.ts';

/** Items to ask about in one run, so one sync never waits on many model calls. */
export const PER_RUN = 5;

export interface Candidate {
	id: string;
	title: string;
	body: string;
	source: string;
}

export interface InferDeps {
	complete: Complete;
	model: string;
	/** Tokens already spent today in this scope. */
	spent(): Promise<number>;
	limit: number;
	record(tokens: number): Promise<void>;
	save(item: Candidate, result: Inferred): Promise<void>;
}

/** What a run of inference did (PM49): recorded with it, so a model that is down, answers in a
 * form we can't read, or hits the allowance is seen. */
export interface InferStats {
	asked: number;
	unreadable: number;
	tokens: number;
	ms: number;
	capped: boolean;
	error: unknown;
}

/** Asks about each candidate until the limit or the per-run cap, and says how many were saved. */
export async function inferItems(
	candidates: Candidate[],
	deps: InferDeps,
	stats: InferStats = { asked: 0, unreadable: 0, tokens: 0, ms: 0, capped: false, error: undefined }
): Promise<number> {
	let saved = 0;
	let spent = await deps.spent();
	const t0 = Date.now();
	for (const item of candidates.slice(0, PER_RUN)) {
		if (spent >= deps.limit) {
			stats.capped = true;
			break;
		}
		try {
			const p = inferencePrompt(item);
			stats.asked++;
			const c = await deps.complete(p.system, p.user);
			spent += c.tokens;
			stats.tokens += c.tokens;
			await deps.record(c.tokens);
			const result = parseInference(c.text);
			if (result) {
				await deps.save(item, result);
				saved++;
			} else stats.unreadable++;
		} catch (e) {
			stats.error = e;
			break; // the model is down or refusing: don't try the rest
		}
	}
	stats.ms = Date.now() - t0;
	return saved;
}

export const configured = () =>
	modelFromEnv({
		provider: INFERENCE_PROVIDER,
		model: INFERENCE_MODEL,
		baseUrl: INFERENCE_BASE_URL,
		apiKey: INFERENCE_API_KEY
	});

/** Proposes statuses for the project's items that have none and no current proposal. */
export async function inferProject(projectId: string): Promise<number> {
	const model = configured();
	if (!model) return 0;
	const s = await loadProjectState(projectId);
	const [row] = await db()<{ config_json: { inference?: boolean } | null }[]>`
		select config_json from project where id = ${projectId}`;
	if (row?.config_json?.inference === false) return 0;
	const [{ tenant_id: tenantId }] = await db()<{ tenant_id: string }[]>`
		select tenant_id from project where id = ${projectId}`;
	if (!(await aiAllowed(String(tenantId)))) return 0;
	const cached = new Map(
		(
			await db()<{ item_id: string; source: string }[]>`
				select item_id, source from item_inference where project_id = ${projectId}`
		).map((r) => [r.item_id, r.source])
	);
	const candidates = s.items
		.filter((i) => !i.meta && cached.get(i.id) !== i.source)
		.map((i) => ({ id: i.id, title: i.titleText, body: i.body, source: i.source }));
	if (!candidates.length) return 0;
	// Spend is counted per tenant (specs/tenants.md §7.2), for tenant-level limits.
	const scope = `tenant:${tenantId}`;
	const stats: InferStats = {
		asked: 0,
		unreadable: 0,
		tokens: 0,
		ms: 0,
		capped: false,
		error: undefined
	};
	const job = await startJob('inference', { projectId, tenantId: String(tenantId) });
	const saved = await inferItems(
		candidates,
		{
			complete: completer(model),
			model: `${model.provider}:${model.model}`,
			// The plan's allowance for the whole tenant, counting questions asked too (§7.2).
			limit: (await planOf(String(tenantId))).limits.ai_tokens_daily ?? Number.MAX_SAFE_INTEGER,
			async spent() {
				return (await usageOf(String(tenantId))).aiTokensToday;
			},
			async record(tokens) {
				await db()`insert into inference_usage (scope, day, tokens) values (${scope}, current_date, ${tokens})
				on conflict (scope, day) do update set tokens = inference_usage.tokens + excluded.tokens`;
			},
			async save(item, result) {
				await db()`insert into item_inference (project_id, item_id, source, status, waiting, model)
				values (${projectId}, ${item.id}, ${item.source}, ${result.status}, ${result.waiting}, ${`${model.provider}:${model.model}`})
				on conflict (project_id, item_id) do update set source = excluded.source,
					status = excluded.status, waiting = excluded.waiting, model = excluded.model,
					created_at = now()`;
			}
		},
		stats
	);
	const detail = {
		saved,
		asked: stats.asked,
		unreadable: stats.unreadable,
		tokens: stats.tokens,
		ms: stats.ms
	};
	if (stats.error !== undefined) await job.end('failed', stats.error, detail);
	else if (stats.capped && !stats.asked)
		await job.end('capped', 'the daily AI allowance is spent', detail);
	else
		await job.end(
			stats.unreadable && !saved ? 'failed' : 'ok',
			stats.unreadable && !saved ? `${stats.unreadable} answer(s) couldn’t be read` : undefined,
			detail
		);
	return saved;
}
