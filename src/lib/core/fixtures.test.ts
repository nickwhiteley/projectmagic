import { describe, expect, it } from 'vitest';
import { fixture } from './fixtures';

describe('fixtures', () => {
	it('reads both repositories', () => {
		expect(fixture('orchard', 'backlog.md')).toMatch(/^### NW9 /m);
		expect(fixture('lantern', 'PROGRESS.md', 'feat-sketch-editor')).toMatch(/^\| 5\.8 /m);
	});
});
