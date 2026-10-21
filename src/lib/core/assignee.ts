// Who an item is for (spec §5.1, PM16). `For:` holds a dotted path whose first part is `person`
// or `agent`: `person.nickwhiteley` is one GitHub login, `agent.claude.opus` one model family,
// `agent` any agent. A path covers everything below it, and no `For:` means anyone's.

export const ASSIGNEE_KINDS = ['person', 'agent'] as const;

const parts = (path: string) => path.trim().toLowerCase().split('.');

/** What is wrong with a `For:` value, or null if nothing is. */
export function assigneeProblem(value: string): string | null {
	const p = parts(value);
	if (!(ASSIGNEE_KINDS as readonly string[]).includes(p[0]))
		return 'should start with person or agent, such as person.nickwhiteley or agent.claude';
	if (p.some((x) => !/^[a-z0-9_-]+$/.test(x)))
		return 'should be words joined by dots, with no spaces, such as agent.claude.opus';
	return null;
}

/**
 * Whether an item for `assignee` belongs under the filter `filter`: when either path contains the
 * other, so `person` shows items for `person.nickwhiteley`, and `person.nickwhiteley` shows items
 * for `person`. An item for no one is anyone's, so it shows under every filter.
 */
export function assigneeMatches(assignee: string | null, filter: string): boolean {
	if (!assignee) return true;
	const a = parts(assignee);
	const f = parts(filter);
	const n = Math.min(a.length, f.length);
	return a.slice(0, n).join('.') === f.slice(0, n).join('.');
}

/** The filter a choice in the List or Board stands for: `mine` is the signed-in person. */
export function assigneeFilter(choice: string, login: string | null): string | null {
	if (!choice) return null;
	if (choice === 'mine') return login ? `person.${login}` : null;
	return choice;
}

// Mentions in a comment (PM45): `@agent`, `@agent.claude`, or a member's GitHub login. Code spans
// and fences are skipped, and a mention can't follow a word character, so an email address isn't
// one. Trailing dots are the sentence's, not the path's.
const MENTION = /(^|[^\w`@./-])@([A-Za-z0-9][A-Za-z0-9_.-]*)/g;
const CODE = /(```[\s\S]*?(?:```|$)|`[^`\n]*`)/;

/** The `For:` path a mention stands for, or null: an agent path, or `person.<login>`. */
function mentionPath(token: string, logins: string[]): string | null {
	const t = token.replace(/\.+$/, '');
	const lower = t.toLowerCase();
	if ((lower === 'agent' || lower.startsWith('agent.')) && !assigneeProblem(lower)) return lower;
	const login = logins.find((l) => l.toLowerCase() === lower);
	return login ? `person.${login}` : null;
}

/** The text outside code, transformed; code spans and fences are kept as written. */
function outsideCode(text: string, f: (prose: string) => string): string {
	return text
		.split(CODE)
		.map((part, i) => (i % 2 ? part : f(part)))
		.join('');
}

/** The `For:` path of the comment's first mention that names an agent or a member, or null. */
export function firstMention(text: string, logins: string[]): string | null {
	let found: string | null = null;
	outsideCode(text, (prose) => {
		for (const m of prose.matchAll(MENTION)) {
			found ??= mentionPath(m[2], logins);
			if (found) break;
		}
		return prose;
	});
	return found;
}

/**
 * The comment as posted on a PR: agent mentions go in backticks, so GitHub doesn't notify an
 * account called `agent`. Mentions of people stay live, so GitHub notifies them.
 */
export function quoteAgentMentions(text: string): string {
	return outsideCode(text, (prose) =>
		prose.replace(MENTION, (all, pre: string, token: string) => {
			const path = token.replace(/\.+$/, '');
			const lower = path.toLowerCase();
			if (lower !== 'agent' && !lower.startsWith('agent.')) return all;
			return `${pre}\`@${path}\`${token.slice(path.length)}`;
		})
	);
}

/**
 * Where the comment box's *For* starts: the item's `For:`, except when that is the commenter, when
 * it starts at `agent`, since a person commenting is usually handing the work over.
 */
export function commentFor(current: string | null, commenter: string): string {
	if (current && current.toLowerCase() === `person.${commenter.toLowerCase()}`) return 'agent';
	return current ?? '';
}
