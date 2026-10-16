import { auditLog } from '#lib/server/platform.ts';
import { tenantUsage } from '#lib/server/tenants.ts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const t = locals.tenant!;
	return {
		tenant: { name: t.name, slug: t.slug },
		usage: await tenantUsage(t.id),
		recent: (await auditLog(t.id, 8)).map((a) => ({ at: a.at, actor: a.actor, action: a.action }))
	};
};
