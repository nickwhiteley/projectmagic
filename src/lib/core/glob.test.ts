import { describe, expect, it } from 'vitest';
import { globToRegExp, selectDocs } from './glob.ts';

describe('globToRegExp', () => {
	it.each([
		['README.md', 'README.md', true],
		['README.md', 'docs/README.md', false],
		['specs/**/*.md', 'specs/engine.md', true],
		['specs/**/*.md', 'specs/archive/old.md', true],
		['specs/*.md', 'specs/archive/old.md', false],
		['spikes/*/RESULT.md', 'spikes/0.1-postgres/RESULT.md', true],
		['spikes/*/RESULT.md', 'spikes/0.1/x/RESULT.md', false],
		['specs/archive/**', 'specs/archive/a/b.md', true],
		['spec.md', 'specXmd', false]
	])('%s against %s → %s', (glob, path, want) => expect(globToRegExp(glob).test(path)).toBe(want));
});

describe('selectDocs', () => {
	it('keeps markdown matching docs and not docs_exclude, shallow first', () => {
		const paths = [
			'README.md',
			'specs/engine.md',
			'specs/archive/v1.md',
			'src/app.ts',
			'spec.md',
			'notes.txt'
		];
		expect(
			selectDocs(paths, ['README.md', 'spec.md', 'specs/**/*.md'], ['specs/archive/**'])
		).toEqual(['README.md', 'spec.md', 'specs/engine.md']);
	});
});
