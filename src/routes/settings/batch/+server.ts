// A person's choice to hold their edits and save them together (PM25).
import { db } from '#lib/server/db.ts';
import { safeBack } from '#lib/server/edit-actions.ts';
import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ locals, request }) => {
	const form = await request.formData();
	await db()`insert into user_pref (user_id, batch_edits) values (${locals.user!.id}, ${form.get('on') === '1'})
		on conflict (user_id) do update set batch_edits = excluded.batch_edits`;
	redirect(303, safeBack(form.get('back'), '/'));
};
