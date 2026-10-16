import { planReport } from '#lib/server/plans.ts';
import type { LayoutServerLoad } from './$types';

/** What is over or close to its limit, shown on every tenant admin page (§7.2). */
export const load: LayoutServerLoad = async ({ locals }) => ({
	planNotices: locals.tenant ? (await planReport(locals.tenant.id)).notices : []
});
