import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { diffLines } from '#lib/core/diff.ts';
import { parseMeta } from '#lib/core/meta.ts';
import { applyBatch, describeBatch } from '#lib/core/batch.ts';
import { itemSource } from '#lib/core/splice.ts';
import type { GitHubClient } from './github-client.ts';
import { setTaskStatus, taskStatusCell } from '#lib/core/progress.ts';
import { applyChange, applyEdit, prBody, type WriteTarget } from './write.ts';

const PATH = 'backlog.md';

/** A line-level three-way merge, like git's: null when both sides change the same lines. */
function merge3(base: string, ours: string, theirs: string): string | null {
	// Each side's changes as hunks over base's lines: [start, end) replaced by lines.
	const hunks = (side: string) => {
		const out: { start: number; end: number; lines: string[] }[] = [];
		let i = 0;
		let cur: { start: number; end: number; lines: string[] } | null = null;
		for (const d of diffLines(base, side)) {
			if (d.kind === 'same') {
				if (cur) out.push(cur);
				cur = null;
				i++;
				continue;
			}
			cur ??= { start: i, end: i, lines: [] };
			if (d.kind === 'del') cur.end = ++i;
			else cur.lines.push(d.text);
		}
		if (cur) out.push(cur);
		return out;
	};
	const all = [...hunks(ours), ...hunks(theirs)].sort((a, b) => a.start - b.start || a.end - b.end);
	for (let k = 1; k < all.length; k++)
		if (all[k].start < all[k - 1].end || all[k].start === all[k - 1].start) return null;
	const lines = base.replace(/\n$/, '').split('\n');
	for (const h of all.reverse()) lines.splice(h.start, h.end - h.start, ...h.lines);
	return lines.join('\n') + '\n';
}
const blob = (text: string) => createHash('sha1').update(text).digest('hex');

/** An in-memory repository: commits with parents and one file, refs, and pull requests. */
class FakeRepo implements GitHubClient {
	commits = new Map<string, { parents: string[]; text: string }>();
	refs = new Map<string, string>();
	pulls: {
		number: number;
		head: string;
		state: 'open' | 'closed';
		mergedAt?: string;
		headSha?: string;
	}[] = [];
	/** GitHub repositories can delete a merged PR's branch; this one is told not to, or fails to. */
	keepBranchAfterMerge = false;
	calls: string[] = [];
	refuseMerge = false;
	/** The file isn't in the repository yet: reading it is a 404, and the first write makes it. */
	missing = false;
	forbid = new Set<string>();
	/** Runs once before the next PUT of the file, to simulate a concurrent commit. */
	beforePut: (() => void) | null = null;
	private n = 0;

	constructor(text: string) {
		this.refs.set('main', this.commit([], text));
	}

	commit(parents: string[], text: string): string {
		const sha = `c${++this.n}`;
		this.commits.set(sha, { parents, text });
		return sha;
	}

	/** Commits on main directly, as an agent's merge would. */
	pushMain(text: string) {
		this.refs.set('main', this.commit([this.refs.get('main')!], text));
	}

	text(ref: string) {
		return this.commits.get(this.refs.get(ref)!)!.text;
	}

	private ancestors(sha: string): Set<string> {
		const seen = new Set<string>();
		const stack = [sha];
		while (stack.length) {
			const s = stack.pop()!;
			if (seen.has(s)) continue;
			seen.add(s);
			stack.push(...this.commits.get(s)!.parents);
		}
		return seen;
	}

	private mergeBase(a: string, b: string): string {
		const ab = this.ancestors(a);
		// The newest common ancestor: commit numbers grow over time.
		return [...this.ancestors(b)]
			.filter((s) => ab.has(s))
			.sort((x, y) => Number(y.slice(1)) - Number(x.slice(1)))[0];
	}

	async graphql<T>(): Promise<T> {
		throw new Error('unused');
	}
	async rest<T>(): Promise<{ body: T; next: null }> {
		throw new Error('unused');
	}

	async send<T>(
		method: string,
		path: string,
		body?: Record<string, unknown>
	): Promise<{ status: number; body: T }> {
		const p = path.replace(/^\/repos\/o\/r/, '');
		this.calls.push(`${method} ${p.split('?')[0]}`);
		const r = (status: number, b: unknown = null) => ({ status, body: b as T });
		if (this.forbid.has(`${method} ${p.split('?')[0]}`))
			return r(403, { message: 'Resource not accessible by integration' });

		let m: RegExpMatchArray | null;
		if (method === 'GET' && (m = p.match(/^\/git\/ref\/heads\/(.+)$/))) {
			const sha = this.refs.get(decodeURIComponent(m[1]));
			return sha ? r(200, { object: { sha } }) : r(404, { message: 'Not Found' });
		}
		if (method === 'GET' && p.startsWith('/pulls?')) {
			const state = new URLSearchParams(p.split('?')[1]).get('state');
			return r(
				200,
				this.pulls
					.filter((x) => x.state === state && x.head === 'projectmagic')
					.map((x) => ({
						number: x.number,
						html_url: '',
						body: '',
						merged_at: x.mergedAt ?? null,
						head: { sha: x.headSha ?? '' }
					}))
			);
		}
		if (method === 'POST' && p === '/git/refs') {
			this.refs.set(String(body!.ref).replace('refs/heads/', ''), String(body!.sha));
			return r(201, {});
		}
		if (method === 'PATCH' && (m = p.match(/^\/git\/refs\/heads\/(.+)$/))) {
			this.refs.set(m[1], String(body!.sha));
			return r(200, {});
		}
		if (method === 'DELETE' && this.keepBranchAfterMerge && p.endsWith('/projectmagic'))
			return r(204);
		if (method === 'DELETE' && (m = p.match(/^\/git\/refs\/heads\/(.+)$/))) {
			this.refs.delete(m[1]);
			return r(204);
		}
		if (method === 'GET' && (m = p.match(/^\/compare\/(.+)\.\.\.(.+)$/))) {
			const base = this.refs.get(decodeURIComponent(m[1]))!;
			const head = this.refs.get(m[2])!;
			const hb = this.ancestors(head);
			const bb = this.ancestors(base);
			return r(200, {
				ahead_by: [...hb].filter((s) => !bb.has(s)).length,
				behind_by: [...bb].filter((s) => !hb.has(s)).length
			});
		}
		if (method === 'POST' && p === '/merges') {
			const into = this.refs.get(String(body!.base))!;
			const from = this.refs.get(String(body!.head))!;
			const merged = merge3(
				this.commits.get(this.mergeBase(into, from))!.text,
				this.commits.get(into)!.text,
				this.commits.get(from)!.text
			);
			if (merged === null) return r(409, { message: 'Merge conflict' });
			this.refs.set(String(body!.base), this.commit([into, from], merged));
			return r(201, {});
		}
		if (method === 'GET' && p.startsWith(`/contents/${PATH}?ref=`)) {
			if (this.missing) return r(404, { message: 'Not Found' });
			const text = this.text(p.split('ref=')[1]);
			return r(200, {
				sha: blob(text),
				content: Buffer.from(text).toString('base64'),
				encoding: 'base64'
			});
		}
		if (method === 'PUT' && p === `/contents/${PATH}`) {
			this.beforePut?.();
			this.beforePut = null;
			const ref = String(body!.branch);
			if (this.missing && body!.sha !== undefined) return r(422, { message: 'sha was supplied' });
			if (!this.missing && blob(this.text(ref)) !== body!.sha)
				return r(409, { message: 'sha does not match' });
			this.missing = false;
			const sha = this.commit(
				[this.refs.get(ref)!],
				Buffer.from(String(body!.content), 'base64').toString('utf8')
			);
			this.refs.set(ref, sha);
			return r(201, { commit: { sha } });
		}
		if (method === 'POST' && p === '/pulls') {
			const number = 40 + this.pulls.length + 1;
			this.pulls.push({ number, head: 'projectmagic', state: 'open' });
			return r(201, { number, html_url: '', body: '' });
		}
		if (method === 'PUT' && (m = p.match(/^\/pulls\/(\d+)\/merge$/))) {
			if (this.refuseMerge) return r(405, { message: 'At least 1 approving review is required' });
			const branch = this.refs.get('projectmagic')!;
			const sha = this.commit([this.refs.get('main')!], this.commits.get(branch)!.text);
			this.refs.set('main', sha);
			Object.assign(
				this.pulls.find((x) => x.number === Number(m![1]))!,
				{
					state: 'closed',
					mergedAt: '2026-10-14T13:00:00Z',
					headSha: branch
				}
			);
			return r(200, { sha, merged: true });
		}
		throw new Error(`fake GitHub: no route for ${method} ${p}`);
	}
}

const BACKLOG = `## Now

### NW9 DXF export — PRO
**Status:** built · **Size:** M

The body.

### NW7 Renewal reminder
**Status:** todo
`;
const target: WriteTarget = { owner: 'o', repo: 'r', main: 'main', path: PATH, autoMerge: true };
const setStatus = (id: string, status: string) =>
	({ op: 'edit', id, change: { meta: parseMeta(`**Status:** ${status}`)!.entries } }) as const;
const nw9 = (text: string) => text.slice(text.indexOf('### NW9'), text.indexOf('### NW7'));

describe('applyEdit', () => {
	it('with no branch: creates it, commits, opens a PR, squash-merges it and deletes the branch', async () => {
		const gh = new FakeRepo(BACKLOG);
		const res = await applyEdit(gh, target, setStatus('NW9', 'done'));
		expect(res).toMatchObject({ kind: 'merged', pr: 41, message: 'Backlog: edit NW9 DXF export' });
		expect(gh.text('main')).toContain('### NW9 DXF export — PRO\n**Status:** done\n');
		expect(gh.text('main')).toContain('### NW7 Renewal reminder\n**Status:** todo');
		expect(gh.refs.has('projectmagic')).toBe(false);
		expect(gh.calls).toEqual([
			'GET /git/ref/heads/main',
			'GET /git/ref/heads/projectmagic',
			'GET /pulls',
			'POST /git/refs',
			'GET /contents/backlog.md',
			'PUT /contents/backlog.md',
			'POST /pulls',
			'PUT /pulls/41/merge',
			'DELETE /git/refs/heads/projectmagic'
		]);
	});

	it('retries when the file changes underneath, keeping the other change', async () => {
		const gh = new FakeRepo(BACKLOG);
		gh.refs.set('projectmagic', gh.refs.get('main')!);
		gh.pulls.push({ number: 41, head: 'projectmagic', state: 'open' });
		gh.beforePut = () => {
			const ref = gh.refs.get('projectmagic')!;
			gh.refs.set(
				'projectmagic',
				gh.commit([ref], gh.text('projectmagic').replace('**Status:** todo', '**Status:** blocked'))
			);
		};
		const res = await applyEdit(gh, target, setStatus('NW9', 'done'));
		expect(res.kind).toBe('merged');
		expect(gh.text('main')).toContain('**Status:** done');
		expect(gh.text('main')).toContain('### NW7 Renewal reminder\n**Status:** blocked');
		expect(gh.calls.filter((c) => c === 'PUT /contents/backlog.md')).toHaveLength(2);
	});

	it('returns a conflict, and commits nothing, when the item changed since the user opened it', async () => {
		const gh = new FakeRepo(BACKLOG);
		const seen = nw9(BACKLOG);
		gh.pushMain(BACKLOG.replace('The body.', 'An agent rewrote the body.'));
		const res = await applyEdit(gh, target, setStatus('NW9', 'done'), seen);
		expect(res).toMatchObject({ kind: 'conflict' });
		expect(res.kind === 'conflict' && res.theirs).toContain('An agent rewrote the body.');
		expect(gh.calls).not.toContain('PUT /contents/backlog.md');
	});

	it('leaves the PR open when the merge is refused, and the next edit adds to it after merging main in', async () => {
		const gh = new FakeRepo(BACKLOG);
		gh.refuseMerge = true;
		const first = await applyEdit(gh, target, setStatus('NW9', 'done'));
		expect(first).toMatchObject({ kind: 'pending', pr: 41 });
		expect(first.kind === 'pending' && first.reason).toMatch(/approving review/);
		expect(gh.text('main')).toBe(BACKLOG);

		gh.pushMain(BACKLOG + '\n### NW8 Added by an agent\n**Status:** todo\n');
		gh.calls = [];
		const second = await applyEdit(gh, target, setStatus('NW7', 'blocked'));
		expect(second).toMatchObject({ kind: 'pending', pr: 41 });
		expect(gh.calls).toContain('POST /merges');
		expect(gh.calls).not.toContain('POST /pulls');
		const branch = gh.text('projectmagic');
		expect(branch).toContain('**Status:** done');
		expect(branch).toContain('### NW7 Renewal reminder\n**Status:** blocked');
		expect(branch).toContain('### NW8 Added by an agent');
	});

	it('resets a leftover branch whose commits are all in main', async () => {
		const gh = new FakeRepo(BACKLOG);
		gh.refs.set('projectmagic', gh.refs.get('main')!);
		gh.pushMain(BACKLOG.replace('The body.', 'Newer body.'));
		const res = await applyEdit(gh, target, setStatus('NW7', 'blocked'));
		expect(res.kind).toBe('merged');
		expect(gh.calls).toContain('PATCH /git/refs/heads/projectmagic');
		expect(gh.text('main')).toContain('Newer body.');
	});

	it('stops when the branch has commits that are not in main and no PR', async () => {
		const gh = new FakeRepo(BACKLOG);
		gh.refs.set(
			'projectmagic',
			gh.commit([gh.refs.get('main')!], BACKLOG.replace('todo', 'blocked'))
		);
		const res = await applyEdit(gh, target, setStatus('NW9', 'done'));
		expect(res).toMatchObject({ kind: 'blocked', state: 'edits-not-merged' });
	});

	it('stops when main conflicts with the pending edits', async () => {
		const gh = new FakeRepo(BACKLOG);
		gh.refuseMerge = true;
		await applyEdit(gh, target, setStatus('NW9', 'done'));
		gh.pushMain(BACKLOG.replace('**Status:** built', '**Status:** in progress'));
		const res = await applyEdit(gh, target, setStatus('NW7', 'blocked'));
		expect(res).toMatchObject({ kind: 'blocked', state: 'needs-merge-by-hand', pr: 41 });
	});

	it('reports GitHub refusing the user, and changes nothing when the edit changes nothing', async () => {
		const gh = new FakeRepo(BACKLOG);
		gh.forbid.add('POST /git/refs');
		const res = await applyEdit(gh, target, setStatus('NW9', 'done'));
		expect(res).toMatchObject({ kind: 'refused' });
		expect(res.kind === 'refused' && res.detail).toMatch(/can’t create the projectmagic branch/);

		const gh2 = new FakeRepo(BACKLOG);
		const same = await applyEdit(gh2, target, setStatus('NW7', 'todo'));
		expect(same).toEqual({ kind: 'unchanged' });
	});

	it('keeps auto_merge: false edits on the open PR', async () => {
		const gh = new FakeRepo(BACKLOG);
		const res = await applyEdit(gh, { ...target, autoMerge: false }, setStatus('NW9', 'done'));
		expect(res).toMatchObject({ kind: 'pending', reason: 'auto_merge is off' });
		expect(gh.calls).not.toContain('PUT /pulls/41/merge');
	});
});

describe('applyChange: a batch (PM25)', () => {
	it('writes several edits as one commit and one PR, leaving out the one whose item changed', async () => {
		const gh = new FakeRepo(BACKLOG);
		const edits = [
			{ id: 1, op: setStatus('NW9', 'done'), base: itemSource(BACKLOG, 'NW9') },
			{ id: 2, op: setStatus('NW7', 'built'), base: 'stale' }
		];
		let applied: number[] = [];
		const res = await applyChange(gh, target, {
			apply: (text) => {
				const r = applyBatch(text, edits);
				applied = r.applied;
				return r.text;
			},
			describe: (text) =>
				describeBatch(
					text,
					edits.filter((e) => applied.includes(e.id)).map((e) => e.op)
				)
		});
		expect(res).toMatchObject({ kind: 'merged', message: 'Backlog: edit NW9 DXF export' });
		expect(applied).toEqual([1]);
		expect(gh.calls.filter((c) => c.startsWith('PUT /contents'))).toHaveLength(1);
		expect(gh.text('main')).toContain('**Status:** done');
		expect(gh.text('main')).toContain('### NW7 Renewal reminder\n**Status:** todo');
	});
});

describe('applyChange: another file (PM6)', () => {
	const PLAN =
		'| # | Task | Status |\n|---|------|--------|\n| 1 | First | todo |\n| 2 | Second | todo |\n';
	const change = (number: string, status: 'done' | 'blocked') => ({
		apply: (text: string) => setTaskStatus(text, number, status),
		describe: () => `Plan: ${number} ${status}`,
		current: (text: string) => taskStatusCell(text, number)
	});

	it('sets a plan task’s status as one commit, leaving the other rows alone', async () => {
		const gh = new FakeRepo(PLAN);
		const res = await applyChange(
			gh,
			{ ...target, path: 'backlog.md' },
			change('1', 'done'),
			'todo'
		);
		expect(res).toMatchObject({ kind: 'merged', message: 'Plan: 1 done' });
		expect(gh.text('main')).toBe(PLAN.replace('| 1 | First | todo |', '| 1 | First | done |'));
	});

	it('is a conflict when that task’s cell changed since it was shown, but not when another row did', async () => {
		const gh = new FakeRepo(PLAN);
		gh.pushMain(PLAN.replace('| 2 | Second | todo |', '| 2 | Second | done |'));
		expect(await applyChange(gh, target, change('1', 'done'), 'todo')).toMatchObject({
			kind: 'merged'
		});
		const gh2 = new FakeRepo(PLAN);
		gh2.pushMain(PLAN.replace('| 1 | First | todo |', '| 1 | First | blocked |'));
		expect(await applyChange(gh2, target, change('1', 'done'), 'todo')).toMatchObject({
			kind: 'conflict',
			theirs: 'blocked'
		});
	});
});

describe('applyChange: a file that may not exist (PM1)', () => {
	const add = (create?: string) => ({
		apply: (text: string) => `${text}### EP1 Billing\n`,
		describe: () => 'Epics: declare EP1 Billing',
		create
	});

	it('makes the file when it is missing and the change allows it', async () => {
		const gh = new FakeRepo('');
		gh.missing = true;
		const res = await applyChange(gh, { ...target, path: 'backlog.md' }, add(''));
		expect(res).toMatchObject({ kind: 'merged' });
		expect(gh.text('main')).toBe('### EP1 Billing\n');
	});

	it('refuses, as before, when the change does not allow it', async () => {
		const gh = new FakeRepo('');
		gh.missing = true;
		expect(await applyChange(gh, { ...target, path: 'backlog.md' }, add())).toMatchObject({
			kind: 'refused'
		});
	});
});

describe('applyEdit: what it leaves behind', () => {
	it('deletes a branch it created when the edit ends in a conflict', async () => {
		const gh = new FakeRepo(BACKLOG);
		const res = await applyEdit(gh, target, setStatus('NW9', 'done'), 'not what main has');
		expect(res.kind).toBe('conflict');
		expect(gh.refs.has('projectmagic')).toBe(false);
	});

	it('starts again from main when the branch was left behind by a squash merge', async () => {
		const gh = new FakeRepo(BACKLOG);
		gh.keepBranchAfterMerge = true;
		expect((await applyEdit(gh, target, setStatus('NW9', 'done'))).kind).toBe('merged');
		// The branch's own commit is not in main's history after a squash.
		expect(gh.refs.has('projectmagic')).toBe(true);
		const next = await applyEdit(gh, target, setStatus('NW7', 'blocked'));
		expect(next.kind).toBe('merged');
		expect(gh.text('main')).toContain('**Status:** done');
		expect(gh.text('main')).toContain('### NW7 Renewal reminder\n**Status:** blocked');
	});
});

describe('readBase', () => {
	it('undoes the CRLF line endings browsers send', async () => {
		const { readBase } = await import('./item-form.ts');
		const form = new FormData();
		form.set('base', '### NW9 DXF\r\n**Status:** built\r\n');
		expect(readBase(form)).toBe('### NW9 DXF\n**Status:** built\n');
	});
});

describe('prBody', () => {
	it('lists the edits', () => {
		expect(
			prBody([
				{ message: 'Backlog: edit NW9 DXF export', by: 'nickwhiteley', at: '2026-10-14T13:05:00Z' }
			])
		).toBe(
			'Edits made in Project Magic, on the `projectmagic` branch. Each line is one edit.\n\n- Backlog: edit NW9 DXF export (nickwhiteley, 2026-10-14 13:05)'
		);
	});
});
