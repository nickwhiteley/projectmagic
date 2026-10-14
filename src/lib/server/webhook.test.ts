import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { verifySignature } from './webhook.ts';

describe('verifySignature', () => {
	const body = '{"zen":"Keep it logically awesome."}';
	const good = `sha256=${createHmac('sha256', 's3cret').update(body).digest('hex')}`;

	it('accepts the right signature only', () => {
		expect(verifySignature('s3cret', body, good)).toBe(true);
		expect(verifySignature('other', body, good)).toBe(false);
		expect(verifySignature('s3cret', body + ' ', good)).toBe(false);
		expect(verifySignature('s3cret', body, good.replace('sha256=', 'sha1='))).toBe(false);
		expect(verifySignature('s3cret', body, null)).toBe(false);
		expect(verifySignature('s3cret', body, 'sha256=short')).toBe(false);
	});
});
