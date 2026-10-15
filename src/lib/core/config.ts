// `.projectmagic.yml` (spec §4): optional, and every key has a default. A bad value falls back to
// its default with a warning, so one typo never hides a project.
import { parse } from 'yaml';

export interface Config {
	name: string;
	/** Candidates in order; the first that exists on main is the backlog. */
	backlog: string[];
	/** null disables the plan. */
	progress: string | null;
	docs: string[];
	docsExclude: string[];
	main: string;
	activeBranchDays: number;
	/** The prefix suggested for a new item, or null to infer it from the existing ids. */
	newIdPrefix: string | null;
	autoMerge: boolean;
	/** False opts the project out of model-inferred statuses (PM3). */
	inference: boolean;
	/** Glob-like names (`*` only) of the GitHub deployment environments that count as production. */
	productionEnvironments: string[];
}

export interface ConfigResult {
	config: Config;
	warnings: string[];
}

export const DEFAULT_DOCS = [
	'README.md',
	'spec.md',
	'strategy.md',
	'specs/**/*.md',
	'docs/**/*.md'
];

/** What the repository itself says, before the file: its name and default branch. */
export interface RepoFacts {
	name: string;
	defaultBranch: string;
}

export function defaults(repo: RepoFacts): Config {
	return {
		name: repo.name,
		backlog: ['backlog.md', 'BACKLOG.md'],
		progress: 'PROGRESS.md',
		docs: DEFAULT_DOCS,
		docsExclude: [],
		main: repo.defaultBranch,
		activeBranchDays: 30,
		newIdPrefix: null,
		autoMerge: true,
		inference: true,
		productionEnvironments: ['Production*']
	};
}

const KEYS = [
	'name',
	'backlog',
	'progress',
	'docs',
	'docs_exclude',
	'main',
	'active_branch_days',
	'new_id_prefix',
	'auto_merge',
	'inference',
	'production_environments'
];

const isString = (v: unknown): v is string => typeof v === 'string' && v.trim() !== '';
const isStrings = (v: unknown): v is string[] => Array.isArray(v) && v.every(isString);

/** `text` is the file's content, or null when the repository has none. */
export function parseConfig(text: string | null, repo: RepoFacts): ConfigResult {
	const config = defaults(repo);
	const warnings: string[] = [];
	if (text === null) return { config, warnings };

	let raw: unknown;
	try {
		raw = parse(text);
	} catch (e) {
		warnings.push(
			`.projectmagic.yml is not valid YAML, so the defaults apply: ${(e as Error).message}`
		);
		return { config, warnings };
	}
	if (raw === null || raw === undefined) return { config, warnings };
	if (typeof raw !== 'object' || Array.isArray(raw)) {
		warnings.push('.projectmagic.yml is not a mapping of keys, so the defaults apply');
		return { config, warnings };
	}
	const y = raw as Record<string, unknown>;
	const bad = (key: string, want: string) =>
		warnings.push(`${key} should be ${want}; using the default`);

	for (const key of Object.keys(y))
		if (!KEYS.includes(key)) warnings.push(`unknown key ${key}, ignored`);

	if ('name' in y) {
		if (isString(y.name)) config.name = y.name.trim();
		else bad('name', 'text');
	}
	if ('backlog' in y) {
		if (isString(y.backlog)) config.backlog = [y.backlog.trim()];
		else bad('backlog', 'a path');
	}
	if ('progress' in y) {
		if (y.progress === null) config.progress = null;
		else if (isString(y.progress)) config.progress = y.progress.trim();
		else bad('progress', 'a path or null');
	}
	if ('docs' in y) {
		if (isStrings(y.docs)) config.docs = y.docs;
		else bad('docs', 'a list of paths or globs');
	}
	if ('docs_exclude' in y) {
		if (isStrings(y.docs_exclude)) config.docsExclude = y.docs_exclude;
		else bad('docs_exclude', 'a list of paths or globs');
	}
	if ('main' in y) {
		if (isString(y.main)) config.main = y.main.trim();
		else bad('main', 'a branch name');
	}
	if ('active_branch_days' in y) {
		const d = y.active_branch_days;
		if (typeof d === 'number' && Number.isInteger(d) && d > 0) config.activeBranchDays = d;
		else bad('active_branch_days', 'a whole number of days above 0');
	}
	if ('new_id_prefix' in y) {
		const p = y.new_id_prefix;
		if (p === null) config.newIdPrefix = null;
		else if (typeof p === 'string' && /^[A-Z]{1,4}$/.test(p)) config.newIdPrefix = p;
		else bad('new_id_prefix', 'one to four capital letters');
	}
	if ('auto_merge' in y) {
		if (typeof y.auto_merge === 'boolean') config.autoMerge = y.auto_merge;
		else bad('auto_merge', 'true or false');
	}
	if ('inference' in y) {
		if (typeof y.inference === 'boolean') config.inference = y.inference;
		else bad('inference', 'true or false');
	}
	if ('production_environments' in y) {
		if (isStrings(y.production_environments))
			config.productionEnvironments = y.production_environments;
		else bad('production_environments', 'a list of environment names');
	}
	return { config, warnings };
}

/** Whether a deployment environment counts as production: `*` matches any run of characters. */
export function isProductionEnvironment(config: Config, environment: string): boolean {
	return config.productionEnvironments.some((pattern) => {
		const re = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
		return new RegExp(`^${re}$`).test(environment);
	});
}
