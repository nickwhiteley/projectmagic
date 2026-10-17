// What the feedback button accepts (PM35). Pure, so the dialog and the server agree.
export const SCORES = [
	{ value: 1, label: 'Very poor' },
	{ value: 2, label: 'Poor' },
	{ value: 3, label: 'Neither good nor bad' },
	{ value: 4, label: 'Good' },
	{ value: 5, label: 'Very good' }
] as const;

export const MAX_COMMENT = 4000;
/** One account may send this many in an hour. */
export const HOURLY_LIMIT = 10;

export interface FeedbackInput {
	score: number | null;
	comment: string;
	page: string;
}

export function readFeedback(body: unknown): FeedbackInput | { error: string } {
	const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
	const score = b.score === undefined || b.score === null ? null : b.score;
	if (
		score !== null &&
		!(Number.isInteger(score) && (score as number) >= 1 && (score as number) <= 5)
	)
		return { error: 'The score is from 1 to 5.' };
	const comment = typeof b.comment === 'string' ? b.comment.trim() : '';
	if (comment.length > MAX_COMMENT) return { error: `Keep it under ${MAX_COMMENT} characters.` };
	if (score === null && !comment) return { error: 'Leave a score, or tell us what is wrong.' };
	// Only a path on this site: never a URL someone chose.
	const page = typeof b.page === 'string' && /^\/[^\s]{0,300}$/.test(b.page) ? b.page : '';
	return { score: score as number | null, comment, page };
}
