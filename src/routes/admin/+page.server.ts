import { platformOverview } from '#lib/server/platform.ts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => ({ counts: await platformOverview() });
