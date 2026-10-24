// Where the browser reports its errors (PM48, hooks.client.ts). Anyone may post, signed in or not,
// as an error on the sign-in page matters too; each instance takes at most 30 a minute from one
// address, and the fields are cut to size before they are stored.
import { errorText, ignorableClientError } from '#lib/core/ops.ts';
import { recordError } from '#lib/server/ops.ts';
import type { RequestHandler } from './$types';

const recent = new Map<string, number[]>();

function allowed(key: string, now = Date.now()): boolean {
	const times = (recent.get(key) ?? []).filter((t) => now - t < 60_000);
	if (times.length >= 30) return false;
	times.push(now);
	recent.set(key, times);
	if (recent.size > 5000) recent.clear();
	return true;
}

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : null);

export const POST: RequestHandler = async ({ request, locals, getClientAddress }) => {
	const key = locals.user?.id ?? getClientAddress();
	if (!allowed(key)) return new Response(null, { status: 429 });
	const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
	const message = str(body?.message, 2000);
	if (!message) return new Response(null, { status: 400 });
	const stack = str(body?.stack, 8000);
	if (ignorableClientError(message, stack)) return new Response(null, { status: 204 });
	const route = str(body?.route, 200);
	const status = Number(body?.status);
	await recordError({
		source: 'client',
		// A route id is a pattern like /p/[repo]: anything else isn't one of ours.
		route: route && /^\/[\w\-[\]/.()=]*$/.test(route) ? route : null,
		status: Number.isInteger(status) ? status : null,
		message: errorText(message),
		stack,
		userId: locals.user?.id ?? null,
		tenantId: locals.tenant?.id ?? null
	});
	return new Response(null, { status: 204 });
};
