// One project under Operations (PM51): its sync, its webhooks, its held edits and its edit log, with
// what needs attention and the fixes. Metadata only.
import { attention } from '#lib/core/ops.ts';
import { projectOps, snapshot } from '#lib/server/ops-view.ts';
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
	const p = await projectOps(params.id);
	if (!p) error(404, 'Not found');
	const items = attention(await snapshot(p.tenantId)).filter(
		(a) => a.key.endsWith(`:${p.id}`) || a.key.includes(`:${p.id}:`)
	);
	return {
		p: {
			...p,
			edits: p.edits.map((e) => ({
				at: e.at.toISOString(),
				op: e.op,
				item: e.item_id,
				login: e.login,
				error: e.error,
				pr: e.pr_number
			}))
		},
		attention: items
	};
};
