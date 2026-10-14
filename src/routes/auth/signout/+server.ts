import { clearSession } from '#lib/server/session.ts';
import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = ({ cookies }) => {
	clearSession(cookies);
	redirect(303, '/signin');
};
