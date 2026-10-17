import { describe, expect, it } from 'vitest';
import { parseConfig } from './config.ts';
import { parseBacklog } from './backlog.ts';
import { configTemplate, idPrefix, scaffold } from './scaffold.ts';

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
			'.projectmagic.yml'
		]);
	});
	it('adds only the config where a backlog exists', () => {
		expect(scaffold('x', 'main', ['BACKLOG.md']).map((f) => f.path)).toEqual(['.projectmagic.yml']);
	});
	it('adds nothing where everything exists', () => {
		expect(scaffold('x', 'main', ['backlog.md', '.projectmagic.yml'])).toEqual([]);
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
