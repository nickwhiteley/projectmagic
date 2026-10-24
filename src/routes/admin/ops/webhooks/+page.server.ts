import { deliveries } from '#lib/server/ops-view.ts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => ({ rows: await deliveries(null, 200) });
