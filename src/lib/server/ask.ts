// Ask across projects (PM4): one question, answered by the configured model from a digest of
// every project the person can see. Spend is counted per person against the daily token limit.
import { askPrompt, digest, linkAnswer } from '#lib/core/ask.ts';
import { renderMarkdown } from '#lib/core/render.ts';
import { db } from './db.ts';
import { configured } from './inference.ts';
import { aiAllowed, aiTokensLeft } from './plans.ts';
import { completer } from './models.ts';
import type { ProjectState } from '#lib/core/state.ts';

export type AskResult =
	{ ok: true; html: string; truncated: boolean; projects: number } | { ok: false; reason: string };

export const MAX_QUESTION = 500;

export async function ask(
	tenantId: string,
	userId: string,
	login: string,
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
	// The plan's allowance is the tenant's: inference and every member's questions draw on it (§7.2).
	if (!(await aiAllowed(tenantId)))
		return { ok: false, reason: 'AI features are off for this tenant.' };
	const left = await aiTokensLeft(tenantId);
	if (left !== null && left <= 0)
		return {
			ok: false,
			reason: 'This tenant has used today’s AI allowance. It resets at midnight UTC.'
		};

	const d = digest(states);
	if (!d.known.size) return { ok: false, reason: 'There are no items to ask about yet.' };
	const p = askPrompt(q, d, login);
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
		html: renderMarkdown(linkAnswer(text, d.known, d.names)),
		truncated: d.truncated,
		projects: states.filter((s) => s.hasBacklog).length
	};
}
