import { audit } from '#lib/server/tenants.ts';
import { githubAccessFor } from '#lib/server/github-access.ts';
import { asApp } from '#lib/server/github-app.ts';
import { claimable, disconnect, tenantInstallations } from '#lib/server/installations.ts';
import { ReauthRequired } from '#lib/server/user-token.ts';
import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, url }) => {
	const t = locals.tenant!;
	let existing: { id: string; accountLogin: string }[] = [];
	let reauth = false;
	try {
		existing = await claimable(
			{ githubId: locals.user!.githubId },
			githubAccessFor(locals.user!.id)
		);
	} catch (e) {
		// Their GitHub sign-in has lapsed, or GitHub is unreachable: the rest of the page still works.
		reauth = e instanceof ReauthRequired;
		if (!reauth) console.error('claimable:', e instanceof Error ? e.message : e);
	}
	return {
		installations: await tenantInstallations(t.id),
		existing,
		reauth,
		ok: url.searchParams.get('ok'),
		error: url.searchParams.get('error')
	};
};

export const actions: Actions = {
	disconnect: async ({ locals, request }) => {
		const t = locals.tenant!;
		const form = await request.formData();
		const id = Number(form.get('installation'));
		if (!Number.isInteger(id)) return fail(400, { reason: 'Choose an installation.' });
		if (!(await disconnect(t.id, id)))
			return fail(404, { reason: 'That installation is not connected here.' });
		await audit(t.id, locals.user!.id, 'installation.disconnected', `installation:${id}`);
		let note = '';
		if (form.get('uninstall') === 'on') {
			const r = await asApp()
				.send('DELETE', `/app/installations/${id}`)
				.catch(() => null);
			note =
				r && r.status < 300
					? ' and uninstalled from GitHub'
					: ', but GitHub would not uninstall it';
		}
		return {
			done: `Disconnected${note}. Its projects are kept and come back if you reconnect it.`
		};
	}
};
