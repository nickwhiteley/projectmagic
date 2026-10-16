import { UNCLAIMED_STALE_DAYS } from '#lib/core/tenants.ts';
import { asApp } from '#lib/server/github-app.ts';
import { allInstallations } from '#lib/server/installations.ts';
import { audit } from '#lib/server/tenants.ts';
import { db } from '#lib/server/db.ts';
import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	const now = Date.now();
	return {
		staleDays: UNCLAIMED_STALE_DAYS,
		installations: (await allInstallations()).map((i) => ({
			...i,
			stale: !i.tenantId && now - Date.parse(i.createdAt) > UNCLAIMED_STALE_DAYS * 86_400_000
		}))
	};
};

export const actions: Actions = {
	/** Uninstalls the App from an account nobody has claimed. */
	uninstall: async ({ locals, request }) => {
		const id = Number((await request.formData()).get('installation'));
		const [i] = await db()<{ account_login: string }[]>`
			select account_login from installation where id = ${id} and tenant_id is null and removed_at is null`;
		if (!i) return fail(404, { reason: 'That installation is claimed, or already gone.' });
		const r = await asApp()
			.send('DELETE', `/app/installations/${id}`)
			.catch(() => null);
		if (!r || r.status >= 300) return fail(502, { reason: 'GitHub would not uninstall it.' });
		await db()`update installation set removed_at = now() where id = ${id}`;
		await audit(null, locals.user!.id, 'installation.uninstalled', `installation:${id}`, {
			account: i.account_login
		});
		return { done: `Uninstalled from ${i.account_login}.` };
	}
};
