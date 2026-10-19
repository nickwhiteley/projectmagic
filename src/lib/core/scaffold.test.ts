import { describe, expect, it } from 'vitest';
import { parseConfig } from './config.ts';
import { parseBacklog } from './backlog.ts';
import { agentSection, configTemplate, idPrefix, scaffold } from './scaffold.ts';

describe('idPrefix', () => {
	it('takes initials of several words, two letters of one', () => {
		expect(idPrefix('furniture-magic')).toBe('FM');
		expect(idPrefix('project_magic')).toBe('PM');
		expect(idPrefix('BloomPrint')).toBe('BP');
		expect(idPrefix('orchard')).toBe('OR');
		expect(idPrefix('a-b-c-d-e-f')).toBe('ABCD');
		expect(idPrefix('123')).toBe('IT');
	});
});

describe('scaffold', () => {
	it('adds all three files to an empty repository', () => {
		expect(scaffold('furniture-magic', 'main', []).map((f) => f.path)).toEqual([
			'backlog.md',
			'bugs.md',
			'.projectmagic.yml',
			'AGENTS.md',
			'CLAUDE.md'
		]);
	});
	it('adds the config and agent files, but no backlog, where a backlog exists', () => {
		expect(scaffold('x', 'main', ['BACKLOG.md']).map((f) => f.path)).toEqual([
			'.projectmagic.yml',
			'AGENTS.md',
			'CLAUDE.md'
		]);
	});
	it('adds nothing where everything exists, except the section for agents', () => {
		const out = scaffold('x', 'main', [
			'backlog.md',
			'.projectmagic.yml',
			'AGENTS.md',
			'CLAUDE.md'
		]);
		expect(out.map((f) => [f.path, f.append])).toEqual([
			['AGENTS.md', true],
			['CLAUDE.md', true]
		]);
	});
	it('makes CLAUDE.md import an AGENTS.md that exists, and appends to a CLAUDE.md that exists', () => {
		const a = scaffold('x', 'main', ['backlog.md', '.projectmagic.yml', 'AGENTS.md']);
		expect(a.find((f) => f.path === 'CLAUDE.md')?.content).toBe('@AGENTS.md\n');
		const c = scaffold('x', 'main', ['backlog.md', '.projectmagic.yml', 'CLAUDE.md']);
		expect(c.map((f) => f.path)).toEqual(['CLAUDE.md']);
		expect(c[0].append).toBe(true);
	});
	it('links the documentation from the config and from the agent section', () => {
		expect(configTemplate('x', 'main')).toContain('specs/conventions.md');
		expect(agentSection('OR')).toContain('### OR12');
		expect(agentSection('OR')).toContain('specs/conventions.md');
	});
	it('writes a config that parses cleanly, with the prefix the only live key', () => {
		const { config, warnings } = parseConfig(configTemplate('furniture-magic', 'trunk'), {
			name: 'furniture-magic',
			defaultBranch: 'trunk'
		});
		expect(warnings).toEqual([]);
		expect(config.newIdPrefix).toBe('FM');
		expect(config.main).toBe('trunk');
	});
	it('writes a backlog with no items for the parser to trip on', () => {
		const [b] = scaffold('x', 'main', []);
		expect(parseBacklog(b.content).items).toEqual([]);
	});
});
