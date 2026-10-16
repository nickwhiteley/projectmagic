import { auditLog } from '#lib/server/platform.ts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => ({ rows: await auditLog(null, 300) });
