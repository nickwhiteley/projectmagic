import { describe, expect, it } from 'vitest';
import { deliveryError, deploymentState, prEvidence, runStarted } from './delivery-sync.ts';
import { defaults } from '#lib/core/config.ts';
import type { GitHubClient } from './github-client.ts';
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

describe('prEvidence (PM39)', () => {
	const pull = {
		number: 9,
		title: 't',
		body: null,
		html_url: 'https://gh/9',
		created_at: '2026-10-20T00:00:00Z',
		merged_at: '2026-10-21T00:00:00Z',
		merge_commit_sha: 'm',
		head: { ref: 'feat/x', sha: 'abc' }
	};
	const config = defaults({ name: 'r', defaultBranch: 'main' });
	const client = (answers: Record<string, unknown>): GitHubClient =>
		({
			rest: async (path: string) => {
				const key = Object.keys(answers).find((k) => path.includes(k));
				if (!key) throw new Error(`unexpected ${path}`);
				return { body: answers[key], next: null };
			}
		}) as unknown as GitHubClient;

	it('reads the diff, CI on the head commit, and the newest preview among its commits', async () => {
		const gh = client({
			'/pulls/9/commits': [{ sha: 'old' }, { sha: 'abc' }],
			'/pulls/9': { additions: 40, deletions: 2, changed_files: 3 },
			'/deployments?sha=abc': [],
			'/deployments?sha=old': [
				{ id: 5, environment: 'Production', sha: 'old', created_at: '' },
				{ id: 6, environment: 'Preview', sha: 'old', created_at: '' }
			],
			'/actions/runs?head_sha=abc': {
				workflow_runs: [{ id: 1, status: 'completed', conclusion: 'success' }]
			},
			'/compare/old...abc': { files: [{ filename: 'backlog.md' }] },
			'/deployments/6/statuses': [{ state: 'success', environment_url: 'https://pr.vercel.app' }]
		});
		expect(await prEvidence(gh, '/repos/o/r', pull, config)).toEqual({
			additions: 40,
			deletions: 2,
			files: 3,
			ci: 'success',
			preview: 'https://pr.vercel.app'
		});
	});

	it('leaves out a failed run that never started and a stale preview, and is null when the PR can’t be read', async () => {
		const gh = client({
			'/pulls/9/commits': [{ sha: 'abc' }],
			'/pulls/9': { additions: 1, deletions: 0, changed_files: 1 },
			'/actions/runs/1/jobs': { jobs: [{ steps: [] }] },
			'/actions/runs?head_sha=abc': {
				workflow_runs: [{ id: 1, status: 'completed', conclusion: 'failure' }]
			},
			'/deployments?sha=abc': []
		});
		expect((await prEvidence(gh, '/repos/o/r', pull, config))?.ci).toBeNull();
		const stale = client({
			'/pulls/9/commits': [{ sha: 'old' }, { sha: 'abc' }],
			'/pulls/9': { additions: 1, deletions: 0, changed_files: 1 },
			'/actions/runs?head_sha=abc': { workflow_runs: [] },
			'/deployments?sha=abc': [],
			'/deployments?sha=old': [{ id: 6, environment: 'Preview', sha: 'old', created_at: '' }],
			'/deployments/6/statuses': [{ state: 'success', environment_url: 'https://old.vercel.app' }],
			'/compare/old...abc': { files: [{ filename: 'backlog.md' }, { filename: 'src/x.ts' }] }
		});
		expect((await prEvidence(stale, '/repos/o/r', pull, config))?.preview).toBeNull();
		expect(await prEvidence(client({}), '/repos/o/r', pull, config)).toBeNull();
	});
});
