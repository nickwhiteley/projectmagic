// The files a new repository starts with (PM33): an empty backlog, an empty bugs backlog and a
// `.projectmagic.yml` of commented-out defaults. Pure, so the server only has to commit them.
import { defaults } from './config.ts';

export const SCAFFOLD_PR_TITLE = 'Set up Project Magic';

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
		'# Read by Project Magic. Every key is optional; the defaults are shown commented out.',
		'# See spec.md §4 in the Project Magic repository.',
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
}

/** What to add to a repository whose root has the files `existing` (names compared as written).
 * A repository that already has a backlog gets only the config; one without gets all three. Nothing
 * that exists is touched. */
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
	return out;
}
