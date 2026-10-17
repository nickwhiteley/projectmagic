// The feedback button's storage (PM35).
import { HOURLY_LIMIT, type FeedbackInput } from '#lib/core/feedback.ts';
import { db } from './db.ts';

export async function submitFeedback(
	userId: string,
	tenantId: string | null,
	f: FeedbackInput
): Promise<{ ok: true } | { ok: false; reason: string }> {
	const [{ n }] = await db()<{ n: number }[]>`
		select count(*)::int as n from feedback
		where user_id = ${userId} and created_at > now() - interval '1 hour'`;
	if (n >= HOURLY_LIMIT)
		return { ok: false, reason: 'That is a lot of feedback; try again later.' };
	await db()`insert into feedback (user_id, tenant_id, score, comment, page)
		values (${userId}, ${tenantId}, ${f.score}, ${f.comment}, ${f.page})`;
	return { ok: true };
}

export interface FeedbackRow {
	id: string;
	at: string;
	who: string;
	tenant: string | null;
	score: number | null;
	comment: string;
	page: string;
}

export async function listFeedback(limit = 200): Promise<{
	rows: FeedbackRow[];
	average: number | null;
	scored: number;
}> {
	const rows = await db()<(Omit<FeedbackRow, 'at'> & { at: Date })[]>`
		select f.id::text, f.created_at as at, coalesce(u.name, u.github_login) as who, t.name as tenant,
			f.score, f.comment, f.page
		from feedback f join app_user u on u.id = f.user_id left join tenant t on t.id = f.tenant_id
		order by f.created_at desc, f.id desc limit ${limit}`;
	const [s] = await db()<{ avg: number | null; n: number }[]>`
		select avg(score)::float as avg, count(score)::int as n from feedback`;
	return {
		rows: rows.map((r) => ({ ...r, at: r.at.toISOString() })),
		average: s.avg,
		scored: s.n
	};
}
