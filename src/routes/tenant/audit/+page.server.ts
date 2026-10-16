import { auditLog } from '#lib/server/platform.ts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => ({
	rows: await auditLog(locals.tenant!.id, 300)
});
