import { audit } from '#lib/server/tenants.ts';
import { githubAccessFor } from '#lib/server/github-access.ts';
import { asApp } from '#lib/server/github-app.ts';
import { claimable, disconnect, tenantInstallations } from '#lib/server/installations.ts';
import { ReauthRequired } from '#lib/server/user-token.ts';
import { failed } from '#lib/server/ops.ts';
import { applyProjectLimit } from '#lib/server/plan-queries.ts';
import { db as database } from '#lib/server/db.ts';
import { planOf } from '#lib/server/plans.ts';
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
		if (!reauth) await failed('github access', { tenantId: t.id }, e, { step: 'claimable' });
	}
	const repos = await database()<
		{ id: string; owner: string; repo: string; over_limit: boolean; pinned: boolean }[]
	>`select id, owner, repo, over_limit, pinned from project
		where tenant_id = ${t.id} and uninstalled_at is null order by over_limit, lower(owner), lower(repo)`;
	return {
		projectLimit: (await planOf(t.id)).limits.projects,
		repos: repos.map((r) => ({
			id: String(r.id),
			name: `${r.owner}/${r.repo}`,
			over: r.over_limit,
			pinned: r.pinned
		})),
		installations: await tenantInstallations(t.id),
		existing,
		reauth,
		ok: url.searchParams.get('ok'),
		error: url.searchParams.get('error')
	};
};

export const actions: Actions = {
	/** Choose which repositories stay synced when there are more than the plan allows (§7.2). */
	pin: async ({ locals, request }) => {
		const f = await request.formData();
		const id = String(f.get('project'));
		await database()`update project set pinned = ${f.get('pinned') === '1'}
			where id = ${id} and tenant_id = ${locals.tenant!.id}`;
		await applyProjectLimit(database(), locals.tenant!.id);
		return { done: 'Saved.' };
	},
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
