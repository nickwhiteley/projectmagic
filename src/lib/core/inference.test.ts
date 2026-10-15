import { describe, expect, it } from 'vitest';
import { inferencePrompt, parseInference } from './inference.ts';

describe('parseInference', () => {
	it('reads a status and a waiting reason', () => {
		expect(parseInference('{"status": "built", "waiting": "the lawyer"}')).toEqual({
			status: 'built',
			waiting: 'the lawyer'
		});
	});
	it('finds the object in a chatty or fenced reply', () => {
		expect(parseInference('Sure!\n```json\n{"status":"In Progress","waiting":null}\n```')).toEqual({
			status: 'in progress',
			waiting: null
		});
	});
	it('drops a waiting reason on a status that has none', () => {
		expect(parseInference('{"status":"todo","waiting":"nothing"}')).toEqual({
			status: 'todo',
			waiting: null
		});
	});
	it('refuses what is not a status', () => {
		for (const r of [
			'',
			'no json',
			'{"status":"finished"}',
			'{"waiting":"x"}',
			'{"status":3}',
			'[1]',
			'{bad'
		])
			expect(parseInference(r), r).toBeNull();
	});
	it('keeps a waiting reason short', () => {
		expect(
			parseInference(`{"status":"blocked","waiting":"${'x'.repeat(500)}"}`)!.waiting
		).toHaveLength(200);
	});
});

describe('inferencePrompt', () => {
	it('puts the item in the user message and the rules in the system one', () => {
		const p = inferencePrompt({ id: 'B1', title: 'Invoices', body: 'Waiting on the bank.' });
		expect(p.user).toBe('### B1 Invoices\n\nWaiting on the bank.');
		expect(p.system).toContain('"status"');
	});
	it('cuts a long body', () => {
		const p = inferencePrompt({ id: 'B1', title: 'T', body: 'x'.repeat(10_000) });
		expect(p.user.length).toBeLessThan(4100);
	});
});
