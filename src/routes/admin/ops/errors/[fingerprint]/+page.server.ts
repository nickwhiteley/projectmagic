import { errorDetail } from '#lib/server/ops-view.ts';
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, url }) => {
	const d = await errorDetail(params.fingerprint);
	if (!d) error(404, 'Not found');
	return { ...d, ref: url.searchParams.get('ref') };
};
