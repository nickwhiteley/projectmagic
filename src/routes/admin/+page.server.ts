import { attention } from '#lib/core/ops.ts';
import { platformOverview } from '#lib/server/platform.ts';
import { snapshot } from '#lib/server/ops-view.ts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	const items = attention(await snapshot());
	return {
		counts: await platformOverview(),
		// The first thing an admin sees (PM51): whether anything needs them.
		attention: {
			total: items.length,
			critical: items.filter((a) => a.severity === 'critical').length,
			top: items.slice(0, 3).map((a) => a.title)
		}
	};
};
