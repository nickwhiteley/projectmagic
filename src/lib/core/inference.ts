// Inferred status (PM3): for an item with no meta line, a model reads the prose and proposes a
// status and a waiting reason. This is the prompt and the reading of the reply; calling a model
// is the server's.
import { normaliseStatus, type Status } from './meta.ts';

export interface InferenceInput {
	id: string;
	title: string;
	body: string;
}

export interface Inferred {
	status: Status;
	waiting: string | null;
}

const MAX_BODY = 4000;

export const SYSTEM_PROMPT = `You read one item from a software project's backlog and say what state it is in.
Answer with a single JSON object and nothing else: {"status": "...", "waiting": "..."}.
"status" is one of:
- "todo": not started, or only planned
- "in progress": someone is working on it now
- "blocked": it cannot proceed until something outside the work happens
- "in review": a pull request is open and waiting for review
- "built": merged or finished, but waiting for a person to check it
- "done": finished and checked
"waiting" is what a blocked or built item is waiting on, in a few words, or null. Use null for any other status.
Use only what the text says. If it gives no sign of progress, the status is "todo".`;

export function inferencePrompt(item: InferenceInput): { system: string; user: string } {
	const body = item.body.length > MAX_BODY ? `${item.body.slice(0, MAX_BODY)}\n…` : item.body;
	return { system: SYSTEM_PROMPT, user: `### ${item.id} ${item.title}\n\n${body}`.trim() };
}

/** The first JSON object in a reply, as a status and a waiting reason; null if it makes no sense. */
export function parseInference(reply: string): Inferred | null {
	const start = reply.indexOf('{');
	const end = reply.lastIndexOf('}');
	if (start < 0 || end <= start) return null;
	let o: unknown;
	try {
		o = JSON.parse(reply.slice(start, end + 1));
	} catch {
		return null;
	}
	if (!o || typeof o !== 'object') return null;
	const { status: raw, waiting: w } = o as { status?: unknown; waiting?: unknown };
	const status = typeof raw === 'string' ? normaliseStatus(raw) : null;
	if (!status) return null;
	const waiting =
		(status === 'blocked' || status === 'built') && typeof w === 'string' && w.trim()
			? w.trim().slice(0, 200)
			: null;
	return { status, waiting };
}
