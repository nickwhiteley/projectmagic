import { errorGroups } from '#lib/server/ops-view.ts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => ({ groups: await errorGroups(true) });
