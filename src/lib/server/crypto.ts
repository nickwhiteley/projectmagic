// Signing the session cookie and encrypting refresh tokens (spec §11.1).
import {
	createCipheriv,
	createDecipheriv,
	createHmac,
	randomBytes,
	timingSafeEqual
} from 'node:crypto';

/** `value.signature`, with an HMAC-SHA256 over the value. */
export function sign(value: string, secret: string): string {
	return `${value}.${createHmac('sha256', secret).update(value).digest('base64url')}`;
}

/** The value, if the signature is right; otherwise null. */
export function unsign(signed: string, secret: string): string | null {
	const dot = signed.lastIndexOf('.');
	if (dot < 0) return null;
	const value = signed.slice(0, dot);
	const want = Buffer.from(sign(value, secret).slice(dot + 1));
	const got = Buffer.from(signed.slice(dot + 1));
	return want.length === got.length && timingSafeEqual(want, got) ? value : null;
}

/** AES-256-GCM with a fresh IV: `iv.tag.ciphertext`, each base64url. `key` is 32 bytes, base64. */
export function encrypt(plain: string, key: string): string {
	const iv = randomBytes(12);
	const cipher = createCipheriv('aes-256-gcm', Buffer.from(key, 'base64'), iv);
	const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
	return [iv, cipher.getAuthTag(), data].map((b) => b.toString('base64url')).join('.');
}

export function decrypt(sealed: string, key: string): string {
	const [iv, tag, data] = sealed.split('.').map((s) => Buffer.from(s, 'base64url'));
	const decipher = createDecipheriv('aes-256-gcm', Buffer.from(key, 'base64'), iv);
	decipher.setAuthTag(tag);
	return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}

export function randomToken(bytes = 24): string {
	return randomBytes(bytes).toString('base64url');
}
