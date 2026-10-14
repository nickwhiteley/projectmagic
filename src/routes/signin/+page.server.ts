import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

const MESSAGES: Record<string, string> = {
	'not-invited': 'That GitHub account has not been invited to Project Magic.',
	disabled: 'That account has been disabled.'
};

export const load: PageServerLoad = ({ url, locals }) => {
	if (locals.user) redirect(303, '/');
	const next = url.searchParams.get('next');
	return {
		message: MESSAGES[url.searchParams.get('error') ?? ''] ?? null,
		href: `/auth/github${next ? `?next=${encodeURIComponent(next)}` : ''}`
	};
};
