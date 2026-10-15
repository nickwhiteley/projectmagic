import { describe, expect, it } from 'vitest';
import { settle, type SettleDeps } from './settle.ts';

/** A fake clock and a scripted sequence of sync results and cache checks. */
function deps(syncs: ('ran' | 'queued')[], dones: boolean[]) {
	let t = 0;
	const calls: string[] = [];
	const d: SettleDeps = {
		sync: async () => {
			calls.push('sync');
			return syncs.shift() ?? 'ran';
		},
		idle: async () => {
			calls.push('idle');
			t += 2000;
		},
		done: async () => {
			calls.push('done');
			return dones.shift() ?? false;
		},
		sleep: async (ms) => {
			calls.push('sleep');
			t += ms;
		},
		now: () => t
	};
	return { d, calls };
}

describe('settle', () => {
	it('returns after one sync when the cache already holds the edit', async () => {
		const { d, calls } = deps(['ran'], [true]);
		expect(await settle(d)).toBe(true);
		expect(calls).toEqual(['sync', 'done']);
	});

	it('waits for a sync already running, instead of returning while only queued (PM17)', async () => {
		const { d, calls } = deps(['queued'], [true]);
		expect(await settle(d)).toBe(true);
		expect(calls).toEqual(['sync', 'idle', 'done']);
	});

	it('syncs again when GitHub still returned the old head', async () => {
		const { d, calls } = deps(['ran', 'ran'], [false, true]);
		expect(await settle(d)).toBe(true);
		expect(calls).toEqual(['sync', 'done', 'sleep', 'sync', 'done']);
	});

	it('gives up at the limit', async () => {
		const { d, calls } = deps([], []);
		expect(await settle(d, 2000, 500)).toBe(false);
		expect(calls.filter((c) => c === 'sync')).toHaveLength(4);
	});
});
