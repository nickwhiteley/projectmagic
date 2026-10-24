// Connect an installation that already exists and that nobody has claimed.
import { githubAccessFor } from '#lib/server/github-access.ts';
import { audit } from '#lib/server/tenants.ts';
import { claimInstallation } from '#lib/server/installations.ts';
import { syncAfterClaim } from '#lib/server/sync-runner.ts';
import { failed } from '#lib/server/ops.ts';
import { ReauthRequired } from '#lib/server/user-token.ts';
import { redirect } from '@sveltejs/kit';
import { waitUntil } from '@vercel/functions';
import type { RequestHandler } from './$types';

function back(kind: 'ok' | 'error', message: string): never {
	redirect(303, `/tenant/installations?${kind}=${encodeURIComponent(message)}`);
}

export const POST: RequestHandler = async ({ locals, request }) => {
	const id = Number((await request.formData()).get('installation'));
	if (!Number.isInteger(id)) back('error', 'Choose an installation.');
	let result;
	try {
		result = await claimInstallation(
			{ id: locals.user!.id, githubId: locals.user!.githubId },
			locals.tenant!.id,
			id,
			githubAccessFor(locals.user!.id)
		);
	} catch (e) {
		if (e instanceof ReauthRequired) back('error', e.message);
		throw e;
	}
	if (!result.ok) back('error', result.reason);
	await audit(locals.tenant!.id, locals.user!.id, 'installation.connected', `installation:${id}`, {
		account: result.accountLogin
	});
	waitUntil(
		syncAfterClaim(result.installationId).catch((e) =>
			failed('project list', { tenantId: locals.tenant?.id ?? null, trigger: 'claim' }, e)
		)
	);
	back('ok', `Connected ${result.accountLogin}. Its repositories are being added.`);
};
