// A person's choice to hide model-inferred statuses from their own views (PM3).
import { db } from '#lib/server/db.ts';
import { safeBack } from '#lib/server/edit-actions.ts';
import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ locals, request }) => {
	const form = await request.formData();
	await db()`insert into user_pref (user_id, ai_opt_out) values (${locals.user!.id}, ${form.get('optOut') === '1'})
		on conflict (user_id) do update set ai_opt_out = excluded.ai_opt_out`;
	redirect(303, safeBack(form.get('back'), '/'));
};
