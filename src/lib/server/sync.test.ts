import { afterEach, describe, expect, it, vi } from 'vitest';
import { tokenClient, type GitHubClient } from './github-client.ts';
import { fetchBranches, parseBlob, type Pr } from './sync.ts';

const NOW = Date.parse('2026-10-14T12:00:00Z');
const pr = (number: number, head: string, state: Pr['state'] = 'OPEN'): Pr => ({
	number,
	title: `PR ${number}`,
	body: null,
	state,
	isDraft: false,
	url: '',
	baseRefName: 'main',
	headRefName: head,
	createdAt: '2026-10-01T00:00:00Z',
	mergedAt: null
});
const node = (
	name: string,
	cmp: [number, number] | null,
	date: string,
	prs: Pr[] = [],
	files: Record<string, string | null> = {}
) => ({
	name,
	compare: cmp && { aheadBy: cmp[0], behindBy: cmp[1] },
	target: {
		oid: `oid-${name}`,
		committedDate: date,
		messageHeadline: `last on ${name}`,
		...Object.fromEntries(Object.entries(files).map(([k, v]) => [k, v && { oid: v }]))
	},
	associatedPullRequests: { nodes: prs }
});

function fake(
	pages: ReturnType<typeof node>[][]
): GitHubClient & { calls: Record<string, unknown>[] } {
	const calls: Record<string, unknown>[] = [];
	return {
		calls,
		async graphql<T>(_q: string, vars: Record<string, unknown> = {}) {
			calls.push(vars);
			const i = vars.after ? Number(vars.after) : 0;
			return {
				repository: {
					defaultBranchRef: { name: 'main' },
					refs: {
						pageInfo: { hasNextPage: i + 1 < pages.length, endCursor: String(i + 1) },
						nodes: pages[i]
					}
				}
			} as T;
		},
		async rest() {
			throw new Error('unused');
		},
		async send() {
			throw new Error('unused');
		}
	};
}

describe('fetchBranches', () => {
	it('reads ahead and behind the right way round, and decides which branches are active', async () => {
		const gh = fake([
			[
				node('main', [0, 0], '2026-10-14T00:00:00Z', [], { f0: 'b-main', f1: null }),
				// compare's base is the branch: main's behindBy is the branch's own commits.
				node('feat/nw9-dxf', [5, 3], '2026-10-13T00:00:00Z', [], { f0: 'b-nw9' }),
				node('old', [0, 2], '2026-08-01T00:00:00Z'),
				node('merged-but-recent', [2, 0], '2026-10-10T00:00:00Z')
			],
			[
				node('stale-with-pr', [9, 1], '2026-06-01T00:00:00Z', [
					pr(7, 'stale-with-pr'),
					pr(8, 'elsewhere')
				]),
				node('projectmagic', [0, 1], '2026-10-14T00:00:00Z')
			]
		]);
		const { branches } = await fetchBranches(
			gh,
			'o',
			'r',
			'main',
			['backlog.md', 'PROGRESS.md'],
			30,
			NOW
		);
		expect(gh.calls).toHaveLength(2);
		expect(
			branches.map((b) => [b.name, b.ahead, b.behind, b.active, b.prs.map((p) => p.number)])
		).toEqual([
			['main', 0, 0, true, []],
			['feat/nw9-dxf', 3, 5, true, []],
			['old', 2, 0, false, []],
			['merged-but-recent', 0, 2, false, []],
			['stale-with-pr', 1, 9, true, [7]],
			['projectmagic', 1, 0, true, []]
		]);
		expect(branches[0].files).toEqual({ 'backlog.md': 'b-main' });
		expect(branches[1].message).toBe('last on feat/nw9-dxf');
	});
});

describe('parseBlob', () => {
	it('keeps each item’s source for branch diffs, and plans in JSON form', () => {
		const b = parseBlob('backlog', '## Now\n\n### NW9 DXF\n**Status:** todo\n', 'r', 'main') as {
			items: { id: string; source: string }[];
		};
		expect(b.items[0]).toMatchObject({ id: 'NW9', source: '### NW9 DXF\n**Status:** todo\n' });
		const p = parseBlob(
			'progress',
			'| # | Task | Status |\n|-|-|-|\n| 1 | A | todo |\n',
			'r',
			'main'
		);
		expect(p).toMatchObject({ next: '1', unknown: [] });
		expect(JSON.parse(JSON.stringify(p))).toEqual(p);
	});
});

describe('tokenClient', () => {
	afterEach(() => vi.unstubAllGlobals());

	it('treats a NOT_FOUND at an aliased field as absent and anything else as fatal', async () => {
		const respond = (body: unknown) =>
			vi.stubGlobal(
				'fetch',
				vi.fn(async () => new Response(JSON.stringify(body), { status: 200 }))
			);
		const gh = tokenClient(async () => 't');

		respond({
			data: { repository: { b0: null } },
			errors: [{ type: 'NOT_FOUND', path: ['repository', 'b0'], message: 'x' }]
		});
		await expect(gh.graphql('q')).resolves.toEqual({ repository: { b0: null } });

		respond({
			data: { repository: null },
			errors: [{ type: 'NOT_FOUND', path: ['repository'], message: 'no repo' }]
		});
		await expect(gh.graphql('q')).rejects.toThrow(/no repo/);
	});
});
