import { describe, expect, it } from 'vitest';
import {
	ciSummary,
	criteria,
	deploymentUrl,
	digestMessage,
	evidenceFor,
	slackWebhookProblem
} from './evidence.ts';

describe('ciSummary', () => {
	const run = (conclusion: string | null, status = 'completed', started = true) => ({
		status,
		conclusion,
		started
	});

	it('is null with no runs, or only runs that never started', () => {
		expect(ciSummary([])).toBeNull();
		expect(ciSummary([run('failure', 'completed', false)])).toBeNull();
	});

	it('fails on any failure, is pending on any unfinished run, else passes', () => {
		expect(ciSummary([run('success'), run('failure')])).toBe('failure');
		expect(ciSummary([run('success'), run(null, 'in_progress')])).toBe('pending');
		expect(ciSummary([run('success'), run('skipped')])).toBe('success');
		expect(ciSummary([run('success'), run('failure', 'completed', false)])).toBe('success');
	});
});

describe('deploymentUrl', () => {
	it('takes the newest status with an https URL', () => {
		expect(
			deploymentUrl([
				{ state: 'inactive', environment_url: null },
				{ state: 'success', environment_url: 'https://pr-1.vercel.app' }
			])
		).toBe('https://pr-1.vercel.app');
		expect(deploymentUrl([{ state: 'success', target_url: 'https://x.vercel.app' }])).toBe(
			'https://x.vercel.app'
		);
	});

	it('ignores a pending status’s log URL and anything not https', () => {
		expect(deploymentUrl([{ state: 'pending', target_url: 'https://logs' }])).toBeNull();
		expect(
			deploymentUrl([{ state: 'success', environment_url: 'javascript:alert(1)' }])
		).toBeNull();
	});
});

describe('criteria', () => {
	it('counts task-list lines outside code', () => {
		expect(criteria('- [x] one\n- [ ] two\n  * [X] three\n```\n- [ ] not this\n```')).toEqual({
			done: 2,
			total: 3
		});
		expect(criteria('No list here.\n- plain bullet')).toBeNull();
	});
});

describe('evidenceFor', () => {
	const prs = [
		{ number: 7, at: '2026-10-20T10:00:00Z', backlog: ['PM39'], url: 'https://gh/7' },
		{
			number: 9,
			at: '2026-10-21T10:00:00Z',
			backlog: ['pm39', 'PM40'],
			url: 'https://gh/9',
			evidence: { additions: 12, deletions: 3, files: 2, ci: 'success' as const, preview: null }
		}
	];

	it('takes the newest merged PR naming the item, with its evidence', () => {
		expect(evidenceFor({ id: 'PM39', body: '- [ ] a' }, prs)).toEqual({
			pr: { number: 9, url: 'https://gh/9' },
			additions: 12,
			deletions: 3,
			files: 2,
			ci: 'success',
			preview: null,
			criteria: { done: 0, total: 1 }
		});
	});

	it('has no PR when none names the item', () => {
		expect(evidenceFor({ id: 'PM1', body: '' }, prs)).toEqual({ pr: null, criteria: null });
	});
});

describe('digestMessage', () => {
	it('is null when nothing waits', () => {
		expect(digestMessage([{ name: 'A', url: 'https://x/p/a', items: [] }])).toBeNull();
	});

	it('lists each project’s items with links, ages and what they wait on, escaped', () => {
		const m = digestMessage([
			{ name: 'Empty', url: 'https://x/p/e', items: [] },
			{
				name: 'Project <Magic>',
				url: 'https://x/p/pm',
				items: [
					{
						id: 'PM39',
						title: 'Waiting & on you',
						kind: 'built',
						waiting: "Nick's check",
						days: 2,
						url: 'https://x/p/pm/i/PM39'
					},
					{
						id: 'PM40',
						title: 'Trust',
						kind: 'reply',
						waiting: null,
						days: null,
						url: 'https://x/p/pm/i/PM40'
					}
				]
			}
		]);
		expect(m!.text).toBe(
			[
				'*2 waiting on you* in Project Magic',
				'',
				'*<https://x/p/pm|Project &lt;Magic&gt;>*',
				"• <https://x/p/pm/i/PM39|PM39> Waiting &amp; on you (to check, 2d) — Nick's check",
				'• <https://x/p/pm/i/PM40|PM40> Trust (agent replied)'
			].join('\n')
		);
	});
});

describe('slackWebhookProblem', () => {
	it('accepts only Slack incoming webhooks', () => {
		expect(slackWebhookProblem('https://hooks.slack.com/services/T0/B0/xyz')).toBeNull();
		expect(slackWebhookProblem('http://hooks.slack.com/services/T0/B0/xyz')).toMatch(/Slack/);
		expect(slackWebhookProblem('https://evil.example/services/x')).toMatch(/Slack/);
		expect(slackWebhookProblem('not a url')).toMatch(/Slack/);
	});
});
