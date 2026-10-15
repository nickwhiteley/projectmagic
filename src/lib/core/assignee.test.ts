import { describe, expect, it } from 'vitest';
import { assigneeFilter, assigneeMatches, assigneeProblem } from './assignee.ts';

describe('assigneeProblem', () => {
	it('accepts paths that start with person or agent', () => {
		for (const v of ['person', 'person.nickwhiteley', 'agent', 'agent.claude', 'agent.claude.opus'])
			expect(assigneeProblem(v)).toBeNull();
		expect(assigneeProblem('Person.NickWhiteley')).toBeNull();
	});

	it('rejects anything else', () => {
		expect(assigneeProblem('nick')).toMatch(/person or agent/);
		expect(assigneeProblem('@nickwhiteley')).toMatch(/person or agent/);
		expect(assigneeProblem('agent..opus')).toMatch(/joined by dots/);
		expect(assigneeProblem('person.nick whiteley')).toMatch(/joined by dots/);
	});
});

describe('assigneeMatches', () => {
	it('shows an item for no one under every filter', () => {
		expect(assigneeMatches(null, 'person.nickwhiteley')).toBe(true);
		expect(assigneeMatches(null, 'agent.claude.opus')).toBe(true);
	});

	it('shows items below the filter', () => {
		expect(assigneeMatches('person.nickwhiteley', 'person')).toBe(true);
		expect(assigneeMatches('agent.claude.opus', 'agent')).toBe(true);
		expect(assigneeMatches('agent.claude.opus', 'agent.claude')).toBe(true);
	});

	it('shows items for a path above the filter', () => {
		expect(assigneeMatches('person', 'person.nickwhiteley')).toBe(true);
		expect(assigneeMatches('agent', 'agent.claude.opus')).toBe(true);
		expect(assigneeMatches('agent.claude', 'agent.claude.opus')).toBe(true);
	});

	it('hides items for a sibling or the other kind', () => {
		expect(assigneeMatches('agent.claude.sonnet', 'agent.claude.opus')).toBe(false);
		expect(assigneeMatches('person.alice', 'person.nickwhiteley')).toBe(false);
		expect(assigneeMatches('agent', 'person.nickwhiteley')).toBe(false);
		expect(assigneeMatches('person.nickwhiteley', 'agent')).toBe(false);
	});

	it('ignores case, as GitHub logins do', () => {
		expect(assigneeMatches('Person.NickWhiteley', 'person.nickwhiteley')).toBe(true);
	});

	it('does not match on a shared start of a word', () => {
		expect(assigneeMatches('agent.claudette', 'agent.claude')).toBe(false);
	});
});

describe('assigneeFilter', () => {
	it('turns mine into the signed-in person', () => {
		expect(assigneeFilter('mine', 'nickwhiteley')).toBe('person.nickwhiteley');
		expect(assigneeFilter('mine', null)).toBeNull();
		expect(assigneeFilter('', 'nickwhiteley')).toBeNull();
		expect(assigneeFilter('agent', 'nickwhiteley')).toBe('agent');
	});
});
