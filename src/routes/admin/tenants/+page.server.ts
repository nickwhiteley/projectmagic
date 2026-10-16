import { listTenants } from '#lib/server/platform.ts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url }) => {
	const q = url.searchParams.get('q') ?? '';
	return { q, tenants: await listTenants(q) };
};
