import { describe, expect, it } from 'vitest';
import type { TocEntry } from '#lib/core/render.ts';
import type { ProjectState } from '#lib/core/state.ts';
import { md } from './views.ts';

const s = { repo: 'x', lastSyncAt: 't', items: [], plan: null } as unknown as ProjectState;
const doc = '# Title\n\n## One\n\nSee [b](b.md) and ![i](i.png).\n\n## Two\n';
const opts = (query: string, toc: TocEntry[]) => ({
	docPath: 'a.md',
	docHref: (p: string) => `/p/x/docs/${p}${query}`,
	imgHref: (p: string) => `/p/x/raw/${p}${query}`,
	toc
});

describe('md', () => {
	it('fills the table of contents on a cache hit too', () => {
		const first: TocEntry[] = [];
		md(s, doc, opts('', first));
		const second: TocEntry[] = [];
		md(s, doc, opts('', second));
		expect(second.map((t) => t.text)).toEqual(first.map((t) => t.text));
		expect(second.length).toBeGreaterThan(1);
	});
	it("links a branch's document to that branch, not to main's cached render", () => {
		const main = md(s, doc, opts('', []));
		const branch = md(s, doc, opts('?ref=feat%2Fy', []));
		expect(main).not.toContain('?ref=');
		expect(branch).toContain('/p/x/docs/b.md?ref=feat%2Fy');
		expect(branch).toContain('/p/x/raw/i.png?ref=feat%2Fy');
	});
});
