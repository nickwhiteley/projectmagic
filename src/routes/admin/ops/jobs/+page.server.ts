import { jobs } from '#lib/server/ops-view.ts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url }) => {
	const kind = url.searchParams.get('kind');
	const outcome = url.searchParams.get('outcome');
	return { kind, outcome, rows: await jobs({ kind, outcome, limit: 200 }) };
};
