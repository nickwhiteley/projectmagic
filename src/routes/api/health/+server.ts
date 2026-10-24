// For an outside uptime check (PM56): 200 when the database answers, its migrations are those this
// build ships, and the daily cron has run in the last 26 hours; 503 otherwise, with what is wrong.
// Nothing secret and no tenant data: whether settings are present, never their values.
import { CRON_LATE_MS } from '#lib/core/ops.ts';
import { now } from '#lib/server/ops-view.ts';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => {
	const n = await now();
	const problems: string[] = [];
	if (!n.db.ok) problems.push('database unreachable');
	if (n.migrations?.missing.length)
		problems.push(`migrations not applied: ${n.migrations.missing.join(', ')}`);
	if (
		n.db.ok &&
		(!n.cron.lastStartedAt || Date.now() - Date.parse(n.cron.lastStartedAt) > CRON_LATE_MS)
	)
		problems.push('the daily cron has not run in 26 hours');
	return json(
		{
			ok: !problems.length,
			problems,
			version: n.version,
			builtAt: n.builtAt,
			db: { ok: n.db.ok, ms: n.db.ms },
			migrations: n.migrations && {
				applied: n.migrations.shipped - n.migrations.missing.length,
				shipped: n.migrations.shipped
			},
			cron: n.cron,
			configured: n.configured
		},
		{ status: problems.length ? 503 : 200, headers: { 'cache-control': 'no-store' } }
	);
};
