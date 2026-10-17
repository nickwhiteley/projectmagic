import { listFeedback } from '#lib/server/feedback.ts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => listFeedback();
