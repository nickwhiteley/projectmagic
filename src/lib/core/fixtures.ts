// Test-only: reads the frozen copies in test/fixtures/ (see its README). Imported by *.test.ts.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../../test/fixtures/', import.meta.url));

export type FixtureRepo = 'orchard' | 'lantern';

export function fixture(repo: FixtureRepo, file: string, ref = 'main'): string {
	return readFileSync(`${root}${repo}/${ref}/${file}`, 'utf8');
}
