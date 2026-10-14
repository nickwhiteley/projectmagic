import { describe, expect, it } from 'vitest';
import { DEFAULT_DOCS, isProductionEnvironment, parseConfig } from './config.ts';
import { fixture } from './fixtures.ts';

const repo = { name: 'orchard', defaultBranch: 'main' };

describe('parseConfig', () => {
	it('gives the defaults when there is no file', () => {
		const { config, warnings } = parseConfig(null, repo);
		expect(warnings).toEqual([]);
		expect(config).toEqual({
			name: 'orchard',
			backlog: ['backlog.md', 'BACKLOG.md'],
			progress: 'PROGRESS.md',
			docs: DEFAULT_DOCS,
			docsExclude: [],
			main: 'main',
			activeBranchDays: 30,
			newIdPrefix: null,
			autoMerge: true,
			productionEnvironments: ['Production*']
		});
	});

	it('reads every key', () => {
		const { config, warnings } = parseConfig(
			`name: Orchard
backlog: docs/BACKLOG.md
progress: null
docs: [README.md]
docs_exclude: [specs/archive/**]
main: trunk
active_branch_days: 14
new_id_prefix: BP
auto_merge: false
production_environments: ["Production – orchard-web"]
`,
			repo
		);
		expect(warnings).toEqual([]);
		expect(config).toEqual({
			name: 'Orchard',
			backlog: ['docs/BACKLOG.md'],
			progress: null,
			docs: ['README.md'],
			docsExclude: ['specs/archive/**'],
			main: 'trunk',
			activeBranchDays: 14,
			newIdPrefix: 'BP',
			autoMerge: false,
			productionEnvironments: ['Production – orchard-web']
		});
	});

	it('falls back per key, with a warning for each bad value and unknown key', () => {
		const { config, warnings } = parseConfig(
			'active_branch_days: -3\nnew_id_prefix: bp\nauto_merge: "yes"\ndocs: README.md\ncolour: blue\n',
			repo
		);
		expect(config.activeBranchDays).toBe(30);
		expect(config.newIdPrefix).toBeNull();
		expect(config.autoMerge).toBe(true);
		expect(config.docs).toEqual(DEFAULT_DOCS);
		expect(warnings).toEqual([
			'unknown key colour, ignored',
			'docs should be a list of paths or globs; using the default',
			'active_branch_days should be a whole number of days above 0; using the default',
			'new_id_prefix should be one to four capital letters; using the default',
			'auto_merge should be true or false; using the default'
		]);
	});

	it('survives a broken or empty file', () => {
		const broken = parseConfig('name: [unclosed', repo);
		expect(broken.config.name).toBe('orchard');
		expect(broken.warnings[0]).toMatch(/not valid YAML/);
		expect(parseConfig('', repo).warnings).toEqual([]);
		expect(parseConfig('- a\n- b\n', repo).warnings).toEqual([
			'.projectmagic.yml is not a mapping of keys, so the defaults apply'
		]);
	});

	it.each(['orchard', 'lantern'] as const)('reads %s without warnings', (r) => {
		const { config, warnings } = parseConfig(fixture(r, '.projectmagic.yml'), {
			name: r,
			defaultBranch: 'main'
		});
		expect(warnings).toEqual([]);
		expect(config.newIdPrefix).toBe(r === 'orchard' ? 'BP' : 'LN');
		expect(config.name).toBe(r === 'orchard' ? 'Orchard' : 'Lantern');
	});
});

describe('isProductionEnvironment', () => {
	const { config } = parseConfig(null, repo);
	it.each([
		['Production', true],
		['Production – orchard-web', true],
		['Preview', false],
		['production', false]
	])('%s → %s', (env, want) => expect(isProductionEnvironment(config, env)).toBe(want));
});
