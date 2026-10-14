import { describe, expect, it } from 'vitest';
import { decrypt, encrypt, sign, unsign } from './crypto.ts';
import { readSession, sessionValue } from './session.ts';

const key = Buffer.alloc(32, 7).toString('base64');

describe('sign and unsign', () => {
	it('round-trips and rejects tampering', () => {
		const s = sign('42:1700000000', 'secret');
		expect(unsign(s, 'secret')).toBe('42:1700000000');
		expect(unsign(s, 'other')).toBeNull();
		expect(unsign(s.replace('42', '43'), 'secret')).toBeNull();
		expect(unsign('no-signature', 'secret')).toBeNull();
	});
});

describe('encrypt and decrypt', () => {
	it('round-trips with a fresh IV each time, and refuses a changed ciphertext', () => {
		const a = encrypt('ghr_refresh', key);
		expect(a).not.toBe(encrypt('ghr_refresh', key));
		expect(decrypt(a, key)).toBe('ghr_refresh');
		const [iv, tag, data] = a.split('.');
		const flipped = Buffer.from(data, 'base64url');
		flipped[0] ^= 1;
		expect(() => decrypt([iv, tag, flipped.toString('base64url')].join('.'), key)).toThrow();
	});
});

describe('the session cookie', () => {
	const now = Date.UTC(2026, 9, 14);
	it('carries the user id for thirty days', () => {
		const v = sessionValue('42', 'secret', now);
		expect(readSession(v, 'secret', now)).toBe('42');
		expect(readSession(v, 'secret', now + 29 * 86_400_000)).toBe('42');
		expect(readSession(v, 'secret', now + 31 * 86_400_000)).toBeNull();
		expect(readSession(v, 'wrong', now)).toBeNull();
		expect(readSession(undefined, 'secret', now)).toBeNull();
	});
});
