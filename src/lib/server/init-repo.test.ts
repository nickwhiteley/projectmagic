import { describe, expect, it } from 'vitest';
import type { GitHubClient } from './github-client.ts';
import { initialiseRepo } from './init-repo.ts';

/** A GitHub that answers by method and path prefix, and records what was sent. */
function fake(routes: Record<string, { status: number; body?: unknown }>) {
	const sent: { key: string; body?: unknown }[] = [];
	const gh = {
		send: async (method: string, path: string, body?: unknown) => {
			const key = `${method} ${path.split('?')[0]}`;
			sent.push({ key, body });
			const hit = Object.entries(routes)
				.filter(([k]) => key.startsWith(k))
				.sort((a, b) => b[0].length - a[0].length)[0];
			return hit?.[1] ?? { status: 404, body: {} };
		}
	} as unknown as GitHubClient;
	return { gh, sent, keys: () => sent.map((s) => s.key) };
}

const repo = { owner: 'acme', repo: 'furniture-magic', defaultBranch: 'main' };
const base = {
	'GET /repos/acme/furniture-magic/contents': { status: 200, body: [] },
	'GET /repos/acme/furniture-magic/git/ref/heads/main': {
		status: 200,
		body: { object: { sha: 'abc' } }
	},
	'POST /repos/acme/furniture-magic/git/refs': { status: 201 },
	'PUT /repos/acme/furniture-magic/contents/': { status: 201 },
	'POST /repos/acme/furniture-magic/pulls': { status: 201, body: { number: 7 } },
	'PUT /repos/acme/furniture-magic/pulls/7/merge': { status: 200 },
	'DELETE /repos/acme/furniture-magic/git/refs/heads/projectmagic': { status: 204 }
};

describe('initialiseRepo', () => {
	it('commits the three files to the projectmagic branch, merges the PR and deletes the branch', async () => {
		const g = fake(base);
		expect(await initialiseRepo(g.gh, repo)).toBe('done');
		expect(g.keys()).toEqual([
			'GET /repos/acme/furniture-magic/contents',
			'GET /repos/acme/furniture-magic/git/ref/heads/main',
			'POST /repos/acme/furniture-magic/git/refs',
			'PUT /repos/acme/furniture-magic/contents/backlog.md',
			'PUT /repos/acme/furniture-magic/contents/bugs.md',
			'PUT /repos/acme/furniture-magic/contents/.projectmagic.yml',
			'PUT /repos/acme/furniture-magic/contents/AGENTS.md',
			'PUT /repos/acme/furniture-magic/contents/CLAUDE.md',
			'POST /repos/acme/furniture-magic/pulls',
			'PUT /repos/acme/furniture-magic/pulls/7/merge',
			'DELETE /repos/acme/furniture-magic/git/refs/heads/projectmagic'
		]);
		expect(g.sent[2].body).toMatchObject({ ref: 'refs/heads/projectmagic', sha: 'abc' });
	});
	it('does nothing where the repository has everything', async () => {
		const g = fake({
			...base,
			'GET /repos/acme/furniture-magic/contents': {
				status: 200,
				body: [
					{ name: 'backlog.md', type: 'file' },
					{ name: '.projectmagic.yml', type: 'file' },
					{ name: 'AGENTS.md', type: 'file' },
					{ name: 'CLAUDE.md', type: 'file' }
				]
			},
			'GET /repos/acme/furniture-magic/contents/': {
				status: 200,
				body: { sha: 's', content: Buffer.from('# Mine\n\n## Project Magic\n').toString('base64') }
			}
		});
		expect(await initialiseRepo(g.gh, repo)).toBe('done');
		expect(g.keys().filter((k) => k.startsWith('PUT') || k.startsWith('POST'))).toEqual([]);
	});
	it('adds only the config where a backlog exists', async () => {
		const g = fake({
			...base,
			'GET /repos/acme/furniture-magic/contents': {
				status: 200,
				body: [{ name: 'backlog.md', type: 'file' }]
			}
		});
		await initialiseRepo(g.gh, repo);
		expect(g.keys().filter((k) => k.startsWith('PUT') && k.includes('/contents/'))).toEqual([
			'PUT /repos/acme/furniture-magic/contents/.projectmagic.yml',
			'PUT /repos/acme/furniture-magic/contents/AGENTS.md',
			'PUT /repos/acme/furniture-magic/contents/CLAUDE.md'
		]);
	});
	it('adds the section to the end of an existing CLAUDE.md, keeping its text and sha', async () => {
		const g = fake({
			...base,
			'GET /repos/acme/furniture-magic/contents': {
				status: 200,
				body: [
					{ name: 'backlog.md', type: 'file' },
					{ name: '.projectmagic.yml', type: 'file' },
					{ name: 'CLAUDE.md', type: 'file' }
				]
			},
			'GET /repos/acme/furniture-magic/contents/CLAUDE.md': {
				status: 200,
				body: { sha: 'old', content: Buffer.from('# Mine\n').toString('base64') }
			}
		});
		expect(await initialiseRepo(g.gh, repo)).toBe('done');
		const put = g.sent.find(
			(x) => x.key.endsWith('/contents/CLAUDE.md') && x.key.startsWith('PUT')
		);
		const b = put!.body as { sha: string; content: string };
		const text = Buffer.from(b.content, 'base64').toString('utf8');
		expect(b.sha).toBe('old');
		expect(text.startsWith('# Mine\n\n## Project Magic')).toBe(true);
	});
	it('defers an empty repository, and a projectmagic branch already in use', async () => {
		expect(
			await initialiseRepo(
				fake({ ...base, 'GET /repos/acme/furniture-magic/contents': { status: 404 } }).gh,
				repo
			)
		).toBe('deferred');
		expect(
			await initialiseRepo(
				fake({ ...base, 'POST /repos/acme/furniture-magic/git/refs': { status: 422 } }).gh,
				repo
			)
		).toBe('deferred');
	});
	it('leaves the PR open for a person when the merge is refused, and does not retry', async () => {
		const g = fake({ ...base, 'PUT /repos/acme/furniture-magic/pulls/7/merge': { status: 405 } });
		expect(await initialiseRepo(g.gh, repo)).toBe('done');
		expect(g.keys().some((k) => k.startsWith('DELETE'))).toBe(false);
	});
	it('removes its branch when a file cannot be committed', async () => {
		const g = fake({ ...base, 'PUT /repos/acme/furniture-magic/contents/': { status: 403 } });
		expect(await initialiseRepo(g.gh, repo)).toBe('deferred');
		expect(g.keys().at(-1)).toBe('DELETE /repos/acme/furniture-magic/git/refs/heads/projectmagic');
	});
});
