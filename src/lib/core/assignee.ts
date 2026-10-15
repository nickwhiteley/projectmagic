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
