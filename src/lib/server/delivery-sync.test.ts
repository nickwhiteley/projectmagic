import { describe, expect, it } from 'vitest';
import { deploymentState, runStarted } from './delivery-sync.ts';

describe('deploymentState', () => {
	it('is success if the deploy ever succeeded, even after it went inactive', () => {
		expect(
			deploymentState([{ state: 'inactive' }, { state: 'success' }, { state: 'pending' }])
		).toBe('success');
	});
	it('is the latest state otherwise, and pending with none', () => {
		expect(deploymentState([{ state: 'failure' }, { state: 'pending' }])).toBe('failure');
		expect(deploymentState([])).toBe('pending');
	});
});

describe('runStarted', () => {
	it('is false when no job ran a step, as when Actions billing fails', () => {
		expect(runStarted([{ steps: [] }, {}])).toBe(false);
		expect(runStarted([])).toBe(false);
	});
	it('is true when any job ran a step', () => {
		expect(runStarted([{ steps: [] }, { steps: [{}] }])).toBe(true);
	});
});
