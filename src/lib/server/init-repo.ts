// Setting up a new repository (PM33). When the App first sees a repository, its backlog, bugs
// backlog and `.projectmagic.yml` are added if missing, by a PR from the `projectmagic` branch that
// is merged at once. This is done as the App, since no person is acting. No SvelteKit imports.
import { EDIT_BRANCH } from '#lib/core/branchref.ts';
import { AGENT_MARKER, SCAFFOLD_PR_TITLE, scaffold } from '#lib/core/scaffold.ts';
import type { GitHubClient } from './github-client.ts';

export interface NewRepo {
	owner: string;
	repo: string;
	defaultBranch: string;
}

/** `done`: nothing more to do, whether or not anything was added. `deferred`: try again on the next
 * sync, because the repository is empty or its `projectmagic` branch is in use. */
export type InitResult = 'done' | 'deferred';

const enc = encodeURIComponent;
const ok = (status: number) => status >= 200 && status < 300;

export async function initialiseRepo(gh: GitHubClient, r: NewRepo): Promise<InitResult> {
	const repo = `/repos/${enc(r.owner)}/${enc(r.repo)}`;

	// An empty repository has no commits to branch from, and answers 404 or 409.
	const root = await gh.send<{ name: string; type: string }[]>(
		'GET',
		`${repo}/contents?ref=${enc(r.defaultBranch)}`
	);
	if (!ok(root.status)) return 'deferred';
	let files = scaffold(
		r.repo,
		r.defaultBranch,
		root.body.filter((e) => e.type === 'file').map((e) => e.name)
	);
	// An agent file that exists gets the section added to its end, unless it has it already.
	const appended = new Map<string, string>();
	for (const f of files.filter((f) => f.append)) {
		const cur = await gh.send<{ sha: string; content: string }>(
			'GET',
			`${repo}/contents/${enc(f.path)}?ref=${enc(r.defaultBranch)}`
		);
		if (!ok(cur.status)) return 'deferred';
		const text = Buffer.from(cur.body.content, 'base64').toString('utf8');
		if (text.includes(AGENT_MARKER)) files = files.filter((x) => x !== f);
		else {
			appended.set(f.path, cur.body.sha);
			f.content = text + (text.endsWith('\n') ? '\n' : '\n\n') + f.content;
		}
	}
	if (!files.length) return 'done';

	const main = await gh.send<{ object: { sha: string } }>(
		'GET',
		`${repo}/git/ref/heads/${enc(r.defaultBranch)}`
	);
	if (!ok(main.status)) return 'deferred';
	// If the branch exists, someone's edits are on it. Leave it alone and come back.
	const made = await gh.send('POST', `${repo}/git/refs`, {
		ref: `refs/heads/${EDIT_BRANCH}`,
		sha: main.body.object.sha
	});
	if (!ok(made.status)) return 'deferred';

	for (const f of files) {
		const put = await gh.send('PUT', `${repo}/contents/${f.path.split('/').map(enc).join('/')}`, {
			message: `${appended.has(f.path) ? 'Update' : 'Add'} ${f.path}`,
			content: Buffer.from(f.content, 'utf8').toString('base64'),
			branch: EDIT_BRANCH,
			...(appended.has(f.path) ? { sha: appended.get(f.path) } : {})
		});
		if (!ok(put.status)) {
			await gh.send('DELETE', `${repo}/git/refs/heads/${EDIT_BRANCH}`);
			return 'deferred';
		}
	}

	const pr = await gh.send<{ number: number }>('POST', `${repo}/pulls`, {
		title: SCAFFOLD_PR_TITLE,
		head: EDIT_BRANCH,
		base: r.defaultBranch,
		body: `Project Magic added or updated ${files.map((f) => `\`${f.path}\``).join(', ')} to this repository.`
	});
	if (!ok(pr.status)) return 'deferred';
	const merged = await gh.send('PUT', `${repo}/pulls/${pr.body.number}/merge`, {
		merge_method: 'squash',
		commit_title: `${SCAFFOLD_PR_TITLE} (#${pr.body.number})`,
		commit_message: ''
	});
	// A refused merge (branch protection, say) leaves the PR open for a person; it is not retried.
	if (ok(merged.status)) await gh.send('DELETE', `${repo}/git/refs/heads/${EDIT_BRANCH}`);
	return 'done';
}
