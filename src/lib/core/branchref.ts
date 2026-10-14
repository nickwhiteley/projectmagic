// Branch names and pull request text (spec §5.3): `<type>/<ref>-<slug>`, and a PR body's
// `Backlog:`, `Plan:`, `Bug:` and `Raised:` lines.
import { LETTER_ID, TASK_ID } from './meta.ts';

export const BRANCH_TYPES = ['feat', 'fix', 'spike', 'spec', 'chore', 'docs'] as const;
export type BranchType = (typeof BRANCH_TYPES)[number];

/** Reserved for Project Magic's own edits (§10.2): never linked, never work. */
export const EDIT_BRANCH = 'projectmagic';

export interface BranchRef {
	type: BranchType;
	/** An item id or plan task number, as the item or task writes it (`nw9` → `NW9`). */
	ref: string | null;
	slug: string;
}

/** A ref is written in lower case: `nw9`, `a1a`, `5.7`. Give it back its capitals. */
function refToId(token: string): string | null {
	if (TASK_ID.test(token)) return token;
	const m = token.match(/^([a-z]{1,4})([0-9]+)([a-z]?)$/);
	if (!m) return null;
	const id = m[1].toUpperCase() + m[2] + m[3];
	return LETTER_ID.test(id) ? id : null;
}

/** `feat/nw9-dxf-export` → feat, NW9, dxf-export. Null for a name outside the convention. */
export function parseBranchName(name: string): BranchRef | null {
	const m = name.match(/^([a-z]+)\/(.+)$/);
	if (!m || !(BRANCH_TYPES as readonly string[]).includes(m[1])) return null;
	const rest = m[2];
	const dash = rest.indexOf('-');
	const head = dash < 0 ? rest : rest.slice(0, dash);
	const ref = refToId(head);
	return {
		type: m[1] as BranchType,
		ref,
		slug: ref ? (dash < 0 ? '' : rest.slice(dash + 1)) : rest
	};
}

export const BUG_ENVIRONMENTS = ['production', 'preview', 'development'] as const;
export type BugEnvironment = (typeof BUG_ENVIRONMENTS)[number];

export interface PrText {
	backlog: string[];
	plan: string[];
	bug: BugEnvironment | null;
	/** As written; the caller parses dates. */
	raised: string | null;
	/** An id at the start of the title, followed by a colon: `NW9: DXF export`. */
	titleId: string | null;
}

/** The ids on a line such as `Backlog: NW9, A1a (part)`: the first word of each comma-separated part. */
function ids(value: string, valid: (s: string) => boolean): string[] {
	return value
		.split(',')
		.map((p) => p.trim().replace(/`/g, '').split(/\s+/)[0] ?? '')
		.filter(valid);
}

function lineValue(body: string, key: string): string | null {
	const m = body.match(new RegExp(`^[ \\t]*(?:\\*\\*)?${key}:(?:\\*\\*)?[ \\t]*(.*)$`, 'im'));
	return m ? m[1].trim() : null;
}

export function parsePrText(title: string, body: string | null): PrText {
	const b = body ?? '';
	const anyId = (s: string) => LETTER_ID.test(s) || TASK_ID.test(s);
	const bug = lineValue(b, 'Bug')?.toLowerCase().split(/\s+/)[0] ?? null;
	const t = title.match(/^\s*([A-Z]{1,4}[0-9]+[a-z]?|[0-9]+(?:\.[0-9]+)*[a-z]?):/);
	return {
		backlog: ids(lineValue(b, 'Backlog') ?? '', anyId),
		plan: ids(lineValue(b, 'Plan') ?? '', (s) => TASK_ID.test(s)),
		bug: (BUG_ENVIRONMENTS as readonly string[]).includes(bug ?? '')
			? (bug as BugEnvironment)
			: null,
		raised: lineValue(b, 'Raised') || null,
		titleId: t ? t[1] : null
	};
}
