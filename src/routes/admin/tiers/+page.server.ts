import { QUOTAS, QUOTA_LABEL } from '#lib/core/plans.ts';
import {
	createTier,
	moveTier,
	setFlag,
	setPrice,
	setTierQuota,
	tiersView,
	updateTier
} from '#lib/server/tiers.ts';
import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async () => ({
	view: await tiersView(),
	quotas: QUOTAS.map((q) => ({ key: q, label: QUOTA_LABEL[q] }))
});

const done = (r: { ok: true } | { ok: false; reason: string }) =>
	r.ok ? { done: 'Saved.' } : fail(400, { reason: r.reason });

export const actions: Actions = {
	create: async ({ locals, request }) =>
		done(await createTier(locals.user!.id, String((await request.formData()).get('name') ?? ''))),
	update: async ({ locals, request }) => {
		const f = await request.formData();
		return done(
			await updateTier(
				locals.user!.id,
				String(f.get('tier')),
				String(f.get('name') ?? ''),
				f.get('enabled') === 'on'
			)
		);
	},
	move: async ({ locals, request }) => {
		const f = await request.formData();
		await moveTier(locals.user!.id, String(f.get('tier')), f.get('dir') === 'up' ? 'up' : 'down');
		return { done: 'Moved.' };
	},
	quota: async ({ locals, request }) => {
		const f = await request.formData();
		const tier = String(f.get('tier'));
		for (const q of QUOTAS) {
			const r = await setTierQuota(locals.user!.id, tier, q, String(f.get(q) ?? ''));
			if (!r.ok) return fail(400, { reason: `${QUOTA_LABEL[q]}: ${r.reason}` });
		}
		return { done: 'Saved.' };
	},
	price: async ({ locals, request }) => {
		const f = await request.formData();
		const tier = String(f.get('tier'));
		for (const interval of ['month', 'year'] as const) {
			const raw = String(f.get(interval) ?? '').trim();
			if (raw !== '' && !/^\d{1,7}(\.\d{1,2})?$/.test(raw))
				return fail(400, {
					reason: 'Enter a price such as 12 or 12.50, or leave it blank to take the price off sale.'
				});
			await setPrice(
				locals.user!.id,
				tier,
				interval,
				raw === '' ? '' : String(Math.round(parseFloat(raw) * 100))
			);
		}
		return { done: 'Saved.' };
	},
	flag: async ({ locals, request }) => {
		const f = await request.formData();
		const min = String(f.get('min') ?? '');
		return done(
			await setFlag(
				locals.user!.id,
				String(f.get('flag')),
				f.get('enabled') === 'on',
				min === '' ? null : min
			)
		);
	}
};
