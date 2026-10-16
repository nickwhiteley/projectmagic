// The write path (spec §10.2–§10.3). Every edit is a commit on the managed repository's
// `projectmagic` branch, made with the acting user's token, and reaches main through a PR from it,
// which is merged at once (squash) and the branch deleted. If the merge is refused, the PR stays
// open and the edits show as pending. No SvelteKit imports: the client is passed in.
import { EDIT_BRANCH } from '#lib/core/branchref.ts';
import { parseBacklog } from '#lib/core/backlog.ts';
import { describe, itemSource, splice, SpliceError, type Op } from '#lib/core/splice.ts';
import type { GitHubClient } from './github-client.ts';

export const EDITS_PR_TITLE = 'Project Magic edits';

export interface WriteTarget {
	owner: string;
	repo: string;
	main: string;
	/** The backlog's path on main. */
	path: string;
	autoMerge: boolean;
}

export type WriteResult =
	| { kind: 'merged'; commit: string; pr: number; message: string; baseOid: string }
	| {
			kind: 'pending';
			commit: string;
			pr: number;
			message: string;
			baseOid: string;
			reason: string;
	  }
	| { kind: 'conflict'; theirs: string | null; baseOid: string }
	| { kind: 'unchanged' }
	| {
			kind: 'blocked';
			state: 'edits-not-merged' | 'needs-merge-by-hand';
			detail: string;
			pr?: number;
	  }
	| { kind: 'refused'; detail: string };

export class WriteError extends Error {}

interface Ref {
	object: { sha: string };
}
interface Pull {
	number: number;
	html_url: string;
	body: string | null;
}
interface Contents {
	sha: string;
	content: string;
	encoding: string;
}

const enc = encodeURIComponent;
const ok = (status: number) => status >= 200 && status < 300;

/** "Your GitHub account can't write to this repository" and friends (§11.2). */
function refusal(status: number, body: unknown, doing: string): WriteResult {
	const message = (body as { message?: string } | null)?.message ?? '';
	if (status === 403 || status === 404)
		return {
			kind: 'refused',
			detail: `Your GitHub account can’t ${doing} in this repository (${status} ${message}).`
		};
	return { kind: 'refused', detail: `GitHub refused to ${doing}: ${status} ${message}` };
}

/** A change to one file: what the write path needs to know, whatever the file is (PM6). */
export interface FileChange {
	/** The new text from the current one. Throws SpliceError or WriteError when it can't be made. */
	apply(text: string): string;
	/** The commit message, from the text before the change. */
	describe(text: string): string;
	/** The part of the file the user based the change on, now; compared with `base`. */
	current?(text: string): string | null;
}

/** An edit to the backlog as a change to its file. */
export function backlogChange(op: Op): FileChange {
	return {
		apply: (text) => splice(text, op),
		describe: (text) => describe(op, parseBacklog(text)),
		current: op.op === 'add' ? undefined : (text) => itemSource(text, op.id)
	};
}

export function applyEdit(
	gh: GitHubClient,
	t: WriteTarget,
	op: Op,
	base: string | null = null
): Promise<WriteResult> {
	return applyChange(gh, t, backlogChange(op), base);
}

/**
 * Applies one change. `base`, for a change to something the user saw, is that part of the file as
 * they saw it; if main's copy has changed since, the result is a conflict for the user to resolve
 * (§10.3 step 4), never an overwrite.
 */
export async function applyChange(
	gh: GitHubClient,
	t: WriteTarget,
	change: FileChange,
	base: string | null = null
): Promise<WriteResult> {
	const repo = `/repos/${enc(t.owner)}/${enc(t.repo)}`;

	// 1. The branch's state decides what happens first (§10.2's table).
	const mainRef = await gh.send<Ref>('GET', `${repo}/git/ref/heads/${enc(t.main)}`);
	if (!ok(mainRef.status)) return refusal(mainRef.status, mainRef.body, 'read main');
	const mainSha = mainRef.body.object.sha;
	const branch = await gh.send<Ref>('GET', `${repo}/git/ref/heads/${EDIT_BRANCH}`);
	const open = await gh.send<Pull[]>(
		'GET',
		`${repo}/pulls?state=open&head=${enc(`${t.owner}:${EDIT_BRANCH}`)}&base=${enc(t.main)}`
	);
	let pr: Pull | null = ok(open.status) && open.body.length ? open.body[0] : null;
	// A branch this call creates is deleted again if the call ends without committing to it, so a
	// conflict or a refusal leaves nothing behind.
	let created = false;
	const cleanup = async (result: WriteResult): Promise<WriteResult> => {
		if (created) await gh.send('DELETE', `${repo}/git/refs/heads/${EDIT_BRANCH}`);
		return result;
	};

	if (branch.status === 404) {
		const made = await gh.send('POST', `${repo}/git/refs`, {
			ref: `refs/heads/${EDIT_BRANCH}`,
			sha: mainSha
		});
		if (!ok(made.status)) return refusal(made.status, made.body, 'create the projectmagic branch');
		created = true;
		pr = null;
	} else if (!ok(branch.status)) {
		return refusal(branch.status, branch.body, 'read the projectmagic branch');
	} else if (pr) {
		// An open PR: bring main into the branch first, so the edit is made against today's backlog.
		const cmp = await gh.send<{ behind_by: number }>(
			'GET',
			`${repo}/compare/${enc(t.main)}...${EDIT_BRANCH}`
		);
		if (ok(cmp.status) && cmp.body.behind_by > 0) {
			const merged = await gh.send('POST', `${repo}/merges`, {
				base: EDIT_BRANCH,
				head: t.main,
				commit_message: `Merge ${t.main} into ${EDIT_BRANCH}`
			});
			if (merged.status === 409)
				return {
					kind: 'blocked',
					state: 'needs-merge-by-hand',
					detail: `Main has changed in a way that conflicts with the pending edits in PR #${pr.number}. Resolve it on GitHub, then edit again.`,
					pr: pr.number
				};
			if (!ok(merged.status))
				return refusal(merged.status, merged.body, `merge ${t.main} into the edits branch`);
		}
	} else {
		// No open PR. If everything on the branch is already in main, start it again from main;
		// otherwise its commits would be lost, so stop and ask a maintainer.
		const cmp = await gh.send<{ ahead_by: number }>(
			'GET',
			`${repo}/compare/${enc(t.main)}...${EDIT_BRANCH}`
		);
		if (!ok(cmp.status)) return refusal(cmp.status, cmp.body, 'compare the edits branch with main');
		// A squash merge never makes the branch's own commits part of main's history, so a branch
		// left behind after one looks unmerged. If its last PR was merged at exactly this commit,
		// nothing on it is lost by starting again.
		const closed = await gh.send<{ merged_at: string | null; head: { sha: string } }[]>(
			'GET',
			`${repo}/pulls?state=closed&head=${enc(`${t.owner}:${EDIT_BRANCH}`)}&base=${enc(t.main)}&sort=updated&direction=desc&per_page=5`
		);
		const squashed =
			ok(closed.status) &&
			closed.body.some((p) => p.merged_at && p.head.sha === branch.body.object.sha);
		if (cmp.body.ahead_by > 0 && !squashed)
			return {
				kind: 'blocked',
				state: 'edits-not-merged',
				detail: `The projectmagic branch has ${cmp.body.ahead_by} commit(s) that aren't in ${t.main} and no open PR. A maintainer needs to reopen a PR for them or discard them.`
			};
		const moved = await gh.send('PATCH', `${repo}/git/refs/heads/${EDIT_BRANCH}`, {
			sha: mainSha,
			force: true
		});
		if (!ok(moved.status))
			return refusal(moved.status, moved.body, 'reset the projectmagic branch');
	}

	// 2–4. Read the branch's backlog, splice by id, and commit with the blob sha as
	// compare-and-swap. A change underneath (409) means read again; three tries.
	let commit: string;
	let message: string;
	let baseOid: string;
	for (let attempt = 0; ; attempt++) {
		const file = await gh.send<Contents>(
			'GET',
			`${repo}/contents/${t.path.split('/').map(enc).join('/')}?ref=${EDIT_BRANCH}`
		);
		if (!ok(file.status)) return cleanup(refusal(file.status, file.body, `read ${t.path}`));
		const text = Buffer.from(file.body.content, 'base64').toString('utf8');
		baseOid = file.body.sha;

		if (base !== null && change.current) {
			const now = change.current(text);
			if (now !== base) return cleanup({ kind: 'conflict', theirs: now, baseOid });
		}
		let next: string;
		try {
			next = change.apply(text);
		} catch (e) {
			if (e instanceof SpliceError) {
				await cleanup({ kind: 'unchanged' });
				throw new WriteError(e.message);
			}
			throw e;
		}
		if (next === text) return cleanup({ kind: 'unchanged' });
		message = change.describe(text);

		const put = await gh.send<{ commit: { sha: string } }>(
			'PUT',
			`${repo}/contents/${t.path.split('/').map(enc).join('/')}`,
			{
				message,
				content: Buffer.from(next, 'utf8').toString('base64'),
				sha: file.body.sha,
				branch: EDIT_BRANCH
			}
		);
		if (ok(put.status)) {
			commit = put.body.commit.sha;
			break;
		}
		if ((put.status === 409 || put.status === 422) && attempt < 2) continue;
		return cleanup(refusal(put.status, put.body, `commit to ${t.path}`));
	}

	// 5. The PR that carries the edits to main.
	if (!pr) {
		const made = await gh.send<Pull>('POST', `${repo}/pulls`, {
			title: EDITS_PR_TITLE,
			head: EDIT_BRANCH,
			base: t.main,
			body: 'Edits made in Project Magic.'
		});
		if (!ok(made.status)) return refusal(made.status, made.body, 'open the edits pull request');
		pr = made.body;
	}

	// 6. Merge at once, squashed into one commit on main, and delete the branch (§10.2).
	if (t.autoMerge) {
		const merged = await gh.send<{ sha: string; message?: string }>(
			'PUT',
			`${repo}/pulls/${pr.number}/merge`,
			{
				merge_method: 'squash',
				commit_title: `${message} (#${pr.number})`,
				commit_message: ''
			}
		);
		if (ok(merged.status)) {
			await gh.send('DELETE', `${repo}/git/refs/heads/${EDIT_BRANCH}`);
			return { kind: 'merged', commit: merged.body.sha, pr: pr.number, message, baseOid };
		}
		const why = (merged.body as { message?: string } | null)?.message ?? `status ${merged.status}`;
		return {
			kind: 'pending',
			commit,
			pr: pr.number,
			message,
			baseOid,
			reason: `GitHub refused the merge: ${why}`
		};
	}
	return { kind: 'pending', commit, pr: pr.number, message, baseOid, reason: 'auto_merge is off' };
}

/** The PR's body: the edits it holds, newest last (§10.3 step 5). */
export function prBody(edits: { message: string; by: string; at: string }[]): string {
	return [
		'Edits made in Project Magic. Each line is one commit on the `projectmagic` branch.',
		'',
		...edits.map((e) => `- ${e.message} (${e.by}, ${e.at.slice(0, 16).replace('T', ' ')})`)
	].join('\n');
}
