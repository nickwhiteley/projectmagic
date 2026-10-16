// Ask across projects (PM4): one question, answered by the configured model from a digest of
// every project the person can see. Spend is counted per person against the daily token limit.
import { INFERENCE_DAILY_TOKEN_LIMIT } from '$app/env/private';
import { askPrompt, digest, linkAnswer } from '#lib/core/ask.ts';
import { renderMarkdown } from '#lib/core/render.ts';
import { db } from './db.ts';
import { configured } from './inference.ts';
import { completer } from './models.ts';
import type { ProjectState } from '#lib/core/state.ts';

export type AskResult =
	{ ok: true; html: string; truncated: boolean; projects: number } | { ok: false; reason: string };

export const MAX_QUESTION = 500;

export async function ask(
	userId: string,
	question: string,
	states: ProjectState[]
): Promise<AskResult> {
	const model = configured();
	if (!model) return { ok: false, reason: 'No model is configured, so there is nothing to ask.' };
	const q = question.trim();
	if (!q) return { ok: false, reason: 'Type a question.' };
	if (q.length > MAX_QUESTION)
		return { ok: false, reason: `Keep the question under ${MAX_QUESTION} characters.` };

	const scope = `ask:${userId}`;
	const limit = INFERENCE_DAILY_TOKEN_LIMIT ?? 50_000;
	const [used] = await db()<{ tokens: string }[]>`
		select tokens from inference_usage where scope = ${scope} and day = current_date`.catch(() => []);
	if (Number(used?.tokens ?? 0) >= limit)
		return {
			ok: false,
			reason: 'You have used today’s allowance for questions. It resets tomorrow.'
		};

	const d = digest(states);
	if (!d.known.size) return { ok: false, reason: 'There are no items to ask about yet.' };
	const p = askPrompt(q, d);
	let reply;
	try {
		reply = await completer(model)(p.system, p.user, { json: false, maxTokens: 1000 });
	} catch (e) {
		console.error('ask:', e instanceof Error ? e.message : e);
		return { ok: false, reason: 'The model did not answer. Try again in a moment.' };
	}
	const text = reply.text.trim();
	await db()`insert into inference_usage (scope, day, tokens) values (${scope}, current_date, ${reply.tokens})
		on conflict (scope, day) do update set tokens = inference_usage.tokens + excluded.tokens`.catch(
		(e) => console.error('ask usage:', e instanceof Error ? e.message : e)
	);
	if (!text) return { ok: false, reason: 'The model sent back an empty answer. Try asking again.' };
	return {
		ok: true,
		html: renderMarkdown(linkAnswer(text, d.known)),
		truncated: d.truncated,
		projects: states.filter((s) => s.hasBacklog).length
	};
}
