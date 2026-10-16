// Save now and Discard for batch edits (PM25).
import { discard } from '#lib/server/batch.ts';
import { safeBack } from '#lib/server/edit-actions.ts';
import { edits } from '#lib/server/edits.ts';
import { ReauthRequired } from '#lib/server/user-token.ts';
import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ locals, params, request }) => {
	const form = await request.formData();
	const back = safeBack(form.get('back'), `/p/${params.repo}`).replace(/([?&])merge=[^&]*&?/, '$1');
	let note: string;
	try {
		if (form.get('do') === 'discard') {
			note = (await discard(locals.project!.id, Number(form.get('id'))))
				? 'Discarded.'
				: 'That edit is being saved right now, so it can’t be discarded. Reload in a moment.';
		} else {
			const r = await edits.savePending(locals.project!, locals.user!);
			note =
				r.detail ??
				(r.saved || r.conflicts
					? `Saved ${r.saved} edit${r.saved === 1 ? '' : 's'}${r.conflicts ? `; ${r.conflicts} left pending because the item changed` : ''}.`
					: 'Nothing to save.');
		}
	} catch (e) {
		if (!(e instanceof ReauthRequired)) throw e;
		note = e.message;
	}
	redirect(303, `${back}${back.includes('?') ? '&' : '?'}merge=${encodeURIComponent(note)}`);
};
