// The files a new repository starts with (PM33): an empty backlog, an empty bugs backlog and a
// `.projectmagic.yml` of commented-out defaults. Pure, so the server only has to commit them.
import { defaults } from './config.ts';

export const SCAFFOLD_PR_TITLE = 'Set up Project Magic';

const DOCS = 'https://github.com/nickwhiteley/projectmagic/blob/main';
/** Text in an agent file that says it already has the section, so it is not added twice. */
export const AGENT_MARKER = '## Project Magic';

/** The section for `AGENTS.md` and `CLAUDE.md`: enough for an agent to use Project Magic without
 * reading anything else, and a link to the full conventions. */
export function agentSection(prefix: string): string {
	return `${AGENT_MARKER}

This repository is tracked by [Project Magic](https://www.projectmagic.work). It reads \`backlog.md\`
(work to do), \`bugs.md\` (bugs, same format), \`.projectmagic.yml\` (settings, all optional), branches
and pull requests to show the project's state. Keep to these conventions so it reads them correctly.
The full version is [specs/conventions.md](${DOCS}/specs/conventions.md); the settings are in
[spec.md §4](${DOCS}/spec.md).

- **An item is a \`###\` heading starting with a unique id**, such as \`### ${prefix}12 Invoices as PDF\`.
  Never reuse an id, even after the item ships. Bugs use the id prefix in \`bug_prefix\`.
- **The line under the heading is the meta line**: \`**Status:** todo · **Size:** S\`, with more
  \`**Key:** value\` pairs joined by \` · \`. Status is \`todo\`, \`in progress\`, \`blocked\`, \`in review\`,
  \`built\` (merged, waiting on a person's check) or \`done\`. \`**Waiting:**\` says what a blocked or
  built item waits on. Keep the meta line current.
- **\`**For:**\` says who an item is for**: \`person\`, \`person.<github-login>\`, \`agent\` or
  \`agent.<maker>.<family>\` (Claude Opus is \`agent.claude.opus\`). Work only on items for you, for a
  path above you, or for no one.
- **Project Magic edits \`backlog.md\` and \`bugs.md\` on the main branch**, as people use it, so your
  branch's copy goes stale. Before you read the backlog to pick an item, or change any item
  (status, meta line, new item), run \`git fetch\` and merge \`origin/main\` into your branch, and do
  it again before you push or open a PR. Change only the items you work on, so the merge is clean.
- **To start an item**, set \`Status: in progress\` and \`**Branch:**\` in your first commit, and push
  the branch straight away. Name branches \`<type>/<id>-<slug>\` (\`feat\`, \`fix\`, \`spike\`, \`spec\`,
  \`chore\` or \`docs\`), such as \`feat/${prefix.toLowerCase()}12-invoices-pdf\`.
- **Every PR body includes \`Backlog: <ids>\`.** A PR that fixes a bug also says \`Bug: production\`,
  \`Bug: preview\` or \`Bug: development\`.
- **Remove an item from the backlog when it ships.** Its completion is read from git history.
- **Never use the branch name \`projectmagic\`.** It is reserved for Project Magic's own edits.
`;
}
/** The ID prefix for a repository: its words' initials (`furniture-magic` is `FM`), or the first
 * two letters of a single word (`orchard` is `OR`). One to four capital letters, as
 * `new_id_prefix` requires. */
export function idPrefix(repo: string): string {
	const words = repo
		.replace(/([a-z0-9])([A-Z])/g, '$1 $2')
		.split(/[^A-Za-z0-9]+/)
		.filter((w) => /^[A-Za-z]/.test(w));
	const letters =
		words.length > 1 ? words.map((w) => w[0]).join('') : (words[0]?.slice(0, 2) ?? '');
	return letters.toUpperCase().slice(0, 4) || 'IT';
}

const HOW_TO = `Items are \`###\` headings that start with a unique id, with a meta line under the heading:

    ### {{PREFIX}}1 A first item
    **Status:** todo · **Size:** S

Status is \`todo\`, \`in progress\`, \`blocked\`, \`in review\`, \`built\` or \`done\`. Add items here, or
with **Add** in Project Magic. The conventions are in Project Magic's \`specs/conventions.md\`.`;

export function backlogTemplate(prefix: string): string {
	return `# Backlog\n\n${HOW_TO.replaceAll('{{PREFIX}}', prefix)}\n`;
}

export function bugsTemplate(bugPrefix: string): string {
	return `# Bugs\n\nBugs found in this project, in the same format as \`backlog.md\`. Give each a \`${bugPrefix}\` id and \`**Type:** bug\`:\n\n    ### ${bugPrefix}1 What is broken\n    **Status:** todo · **Type:** bug · **Found:** production · **Raised:** 2026-01-01 09:00\n`;
}

/** Every key commented out at its default, except the ID prefix, which is the one thing a new
 * repository has no way to infer. */
export function configTemplate(repo: string, defaultBranch: string): string {
	const d = defaults({ name: repo, defaultBranch });
	return [
		'# Read by Project Magic (https://www.projectmagic.work). Every key is optional; the defaults',
		'# are shown commented out.',
		'#',
		'# Documentation:',
		`#   Settings, every key:      ${DOCS}/spec.md (section 4)`,
		`#   Backlog and branch rules: ${DOCS}/specs/conventions.md`,
		'#   Agents: the rules above are also in AGENTS.md and CLAUDE.md, under "Project Magic".',
		'#',
		`# name: ${d.name}`,
		`# backlog: ${d.backlog[0]}`,
		`# progress: ${d.progress}`,
		`# bugs: ${d.bugs}`,
		`# bug_prefix: ${d.bugPrefix}`,
		`# epics: ${d.epics}`,
		'# docs:',
		...d.docs.map((p) => `#   - ${p}`),
		`# main: ${d.main}`,
		`# active_branch_days: ${d.activeBranchDays}`,
		`# auto_merge: ${d.autoMerge}`,
		`# batch_edits: ${d.batchEdits}`,
		`# inference: ${d.inference}`,
		'',
		'# The prefix suggested for a new item, such as PM12. Change it, or remove the line to take',
		'# the prefix from the ids already in the backlog.',
		`new_id_prefix: ${idPrefix(repo)}`,
		''
	].join('\n');
}

export interface ScaffoldFile {
	path: string;
	content: string;
	/** `content` is added to the end of the file that is there, not written as a new one. */
	append?: boolean;
}

/** What to add to a repository whose root has the files `existing` (names compared as written).
 * A repository that already has a backlog gets no backlog or bugs file; one without gets both.
 * Existing files are not changed, except that the Project Magic section is added to the end of
 * `AGENTS.md` and `CLAUDE.md` where they exist (the caller skips one that has it already). */
export function scaffold(repo: string, defaultBranch: string, existing: string[]): ScaffoldFile[] {
	const has = (p: string) => existing.includes(p);
	const out: ScaffoldFile[] = [];
	const hasBacklog = has('backlog.md') || has('BACKLOG.md');
	const prefix = idPrefix(repo);
	if (!hasBacklog) out.push({ path: 'backlog.md', content: backlogTemplate(prefix) });
	if (!hasBacklog && !has('bugs.md'))
		out.push({
			path: 'bugs.md',
			content: bugsTemplate(defaults({ name: repo, defaultBranch }).bugPrefix)
		});
	if (!has('.projectmagic.yml') && !has('.projectmagic.yaml'))
		out.push({ path: '.projectmagic.yml', content: configTemplate(repo, defaultBranch) });
	// Agents read AGENTS.md, and Claude Code reads CLAUDE.md, so each is written or added to; a
	// CLAUDE.md created next to an AGENTS.md just imports it.
	const section = agentSection(prefix);
	const agents = has('AGENTS.md');
	const claude = has('CLAUDE.md');
	if (agents) out.push({ path: 'AGENTS.md', content: section, append: true });
	else if (!claude) out.push({ path: 'AGENTS.md', content: `# Agents\n\n${section}` });
	if (claude) out.push({ path: 'CLAUDE.md', content: section, append: true });
	else out.push({ path: 'CLAUDE.md', content: '@AGENTS.md\n' });
	return out;
}
