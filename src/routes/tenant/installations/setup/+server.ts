// GitHub's Setup URL (specs/tenants.md §3.2 steps 3–4): the person comes back from the install
// page with `installation_id` and the `state` we gave them. The state says which tenant, is single
// use, and must be theirs; then the claim's own checks run.
import { githubAccessFor } from '#lib/server/github-access.ts';
import { audit, switchTenant } from '#lib/server/tenants.ts';
import { claimInstallation, consumeSetupState } from '#lib/server/installations.ts';
import { syncAfterClaim } from '#lib/server/sync-runner.ts';
import { ReauthRequired } from '#lib/server/user-token.ts';
import { redirect } from '@sveltejs/kit';
import { waitUntil } from '@vercel/functions';
import type { RequestHandler } from './$types';

function back(kind: 'ok' | 'error', message: string): never {
	redirect(303, `/tenant/installations?${kind}=${encodeURIComponent(message)}`);
}

export const GET: RequestHandler = async ({ locals, url }) => {
	const user = locals.user;
	if (!user) redirect(303, `/signin?next=${encodeURIComponent(url.pathname + url.search)}`);
	const id = Number(url.searchParams.get('installation_id'));
	if (!Number.isInteger(id) || id <= 0) back('error', 'GitHub did not say which installation.');

	const state = url.searchParams.get('state');
	let tenantId = locals.tenant?.id ?? null;
	if (state) {
		const spent = await consumeSetupState(state, user.id);
		if (!spent)
			back(
				'error',
				'That link has expired or was not started here. Start again from Connect GitHub.'
			);
		tenantId = spent.tenantId;
	}
	// Whoever started it must still be an admin of an active tenant, and that tenant becomes current.
	const tenant = locals.tenants.find((t) => t.id === tenantId);
	if (!tenant || tenant.role !== 'admin' || tenant.status !== 'active')
		back('error', 'Only an admin of an active tenant can connect GitHub.');
	await switchTenant(user.id, tenant.id);

	let result;
	try {
		result = await claimInstallation(
			{ id: user.id, githubId: user.githubId },
			tenant.id,
			id,
			githubAccessFor(user.id)
		);
	} catch (e) {
		if (e instanceof ReauthRequired) back('error', e.message);
		throw e;
	}
	if (!result.ok) back('error', result.reason);
	await audit(tenant.id, user.id, 'installation.connected', `installation:${id}`, {
		account: result.accountLogin,
		action: url.searchParams.get('setup_action')
	});
	waitUntil(syncAfterClaim(result.installationId).catch((e) => console.error('claim sync', e)));
	back('ok', `Connected ${result.accountLogin}. Its repositories are being added.`);
};
