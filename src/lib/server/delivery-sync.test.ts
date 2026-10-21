import { describe, expect, it } from 'vitest';
import { deliveryError, deploymentState, runStarted } from './delivery-sync.ts';
import { GitHubError } from './github-client.ts';

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

describe('deliveryError', () => {
	it('names the missing permission when GitHub says the integration cannot reach it', () => {
		const e = new GitHubError(
			403,
			'GitHub 403 /repos/o/r/actions/runs: {"message":"Resource not accessible by integration"}'
		);
		const line = deliveryError('CI runs', 'o/r', e);
		expect(line).toContain('needs Actions: read');
		expect(line).toContain('Installed GitHub Apps');
		expect(deliveryError('deploys', 'o/r', e)).toContain('needs Deployments: read');
	});
	it('passes any other failure through as it was', () => {
		expect(deliveryError('CI runs', 'o/r', new GitHubError(504, 'GraphQL 504'))).toBe(
			'delivery: CI runs for o/r: GraphQL 504'
		);
		expect(deliveryError('CI runs', 'o/r', new GitHubError(403, 'rate limit exceeded'))).toBe(
			'delivery: CI runs for o/r: rate limit exceeded'
		);
	});
});
