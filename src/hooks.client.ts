// Errors in the browser (PM48): sent to /api/client-error, which records them with the server's,
// so a page that breaks only in someone's browser is seen too. At most five a page load, each
// message once, and never the URL (it can name items): the route id stands in for it.
import { page } from '$app/state';
import { ignorableClientError } from '#lib/core/ops.ts';
import type { ClientInit, HandleClientError } from '@sveltejs/kit/hooks';

const sent = new Set<string>();

function report(message: string, stack: string | null | undefined, status?: number): void {
	if (sent.size >= 5 || sent.has(message) || ignorableClientError(message, stack)) return;
	sent.add(message);
	const body = JSON.stringify({
		message: message.slice(0, 2000),
		stack: stack?.slice(0, 8000) ?? null,
		route: page.route?.id ?? null,
		status: status ?? null
	});
	try {
		if (
			!navigator.sendBeacon?.('/api/client-error', new Blob([body], { type: 'application/json' }))
		)
			void fetch('/api/client-error', { method: 'POST', body, keepalive: true }).catch(() => {});
	} catch {
		// Reporting must never break the page further.
	}
}

const text = (e: unknown) => (e instanceof Error ? e.message || e.name : String(e));
const stackOf = (e: unknown) => (e instanceof Error ? e.stack : null);

/** A navigation's unexpected error. The server's were recorded there, and aren't passed here. */
export const handleError: HandleClientError = (caught) => {
	if (caught.kind === 'unknown') report(text(caught.error), stackOf(caught.error), 500);
};

export const init: ClientInit = () => {
	addEventListener('error', (e) => report(e.message || text(e.error), stackOf(e.error)));
	addEventListener('unhandledrejection', (e) => report(text(e.reason), stackOf(e.reason)));
};
