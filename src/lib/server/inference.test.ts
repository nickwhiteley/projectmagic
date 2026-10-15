import { describe, expect, it, vi } from 'vitest';
import { inferItems, PER_RUN, type Candidate, type InferDeps } from './inference.ts';

const item = (n: number): Candidate => ({
	id: `B${n}`,
	title: `Item ${n}`,
	body: 'Waiting on the bank.',
	source: `### B${n}`
});

function deps(over: Partial<InferDeps> = {}) {
	const saved: string[] = [];
	let spent = 0;
	const d: InferDeps = {
		complete: vi.fn(async () => ({
			text: '{"status":"blocked","waiting":"the bank"}',
			tokens: 100
		})),
		model: 'test:m',
		spent: async () => spent,
		limit: 1000,
		record: async (t) => {
			spent += t;
		},
		save: async (i) => {
			saved.push(i.id);
		},
		...over
	};
	return { d, saved, spent: () => spent };
}

describe('inferItems', () => {
	it('saves a proposal for each item, and counts the tokens', async () => {
		const { d, saved, spent } = deps();
		expect(await inferItems([item(1), item(2)], d)).toBe(2);
		expect(saved).toEqual(['B1', 'B2']);
		expect(spent()).toBe(200);
	});
	it('asks about no more than PER_RUN items', async () => {
		const { d, saved } = deps();
		await inferItems(
			Array.from({ length: 12 }, (_, i) => item(i)),
			d
		);
		expect(saved).toHaveLength(PER_RUN);
	});
	it('stops at the daily limit', async () => {
		const { d, saved } = deps({ limit: 250 });
		await inferItems([item(1), item(2), item(3), item(4)], d);
		expect(saved).toEqual(['B1', 'B2', 'B3']); // 0, 100, 200 spent: the fourth would start at 300
	});
	it('asks nothing when the limit is already spent', async () => {
		const { d } = deps({ spent: async () => 5000 });
		expect(await inferItems([item(1)], d)).toBe(0);
		expect(d.complete).not.toHaveBeenCalled();
	});
	it('skips a reply it cannot read, but still counts its tokens', async () => {
		const { d, saved, spent } = deps({ complete: async () => ({ text: 'dunno', tokens: 30 }) });
		expect(await inferItems([item(1)], d)).toBe(0);
		expect(saved).toEqual([]);
		expect(spent()).toBe(30);
	});
	it('stops, without failing, when the model errors', async () => {
		const { d, saved } = deps({
			complete: vi.fn().mockRejectedValue(new Error('down'))
		});
		vi.spyOn(console, 'error').mockImplementation(() => {});
		expect(await inferItems([item(1), item(2)], d)).toBe(0);
		expect(d.complete).toHaveBeenCalledTimes(1);
		expect(saved).toEqual([]);
	});
});
