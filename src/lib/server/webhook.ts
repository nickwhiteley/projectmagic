// GitHub webhooks (spec §7.4): verified against the secret, and only a trigger, never data.
import { createHmac, timingSafeEqual } from 'node:crypto';

/** `X-Hub-Signature-256` is `sha256=` and an HMAC of the raw body. */
export function verifySignature(secret: string, body: string, header: string | null): boolean {
	if (!header?.startsWith('sha256=')) return false;
	const want = Buffer.from(`sha256=${createHmac('sha256', secret).update(body).digest('hex')}`);
	const got = Buffer.from(header);
	return want.length === got.length && timingSafeEqual(want, got);
}

/** The events that change a project's state, and those that change the project list. */
export const PROJECT_EVENTS = new Set(['push', 'pull_request', 'create', 'delete']);
export const INSTALLATION_EVENTS = new Set(['installation', 'installation_repositories']);
