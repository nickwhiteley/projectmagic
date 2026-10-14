import { describe, expect, it } from 'vitest';
import { parseBacklog } from './backlog.ts';
import { fixture } from './fixtures.ts';
import { link, type Edge } from './link.ts';
import { parseProgress } from './progress.ts';

const main = parseBacklog(`## Now
### NW9 DXF export
**Status:** built · **Plan:** 46, 99

### 5.8 New sketch piece
**Status:** todo

### C2 Pages
**Status:** in progress
`);

const onBranch = parseBacklog(`## Now
### C2 Pages
**Status:** in progress · **Branch:** \`feat/c2-pages\` · **Plan:** 12
`);

const show = (e: Edge) =>
	`${e.from.kind === 'item' ? e.from.id : `task ${e.from.number}`} → ${
		e.to.kind === 'task'
			? `task ${e.to.number}`
			: e.to.kind === 'branch'
				? e.to.name
				: `#${e.to.number}`
	} (${e.source})`;

describe('link', () => {
	const result = link({
		items: main.items,
		tasks: ['46', '5.8', '12'],
		branches: [
			{ name: 'main' },
			{ name: 'feat/nw9-dxf-export' },
			{ name: 'feat/c2-pages' },
			{ name: 'feat/zz9-ghost' },
			{ name: 'projectmagic' }
		],
		prs: [
			{ number: 41, title: 'Backlog edits', body: 'Backlog: NW9', headRef: 'projectmagic' },
			{ number: 7, title: 'DXF', body: 'Backlog: NW9\nPlan: 46', headRef: 'feat/nw9-dxf-export' },
			{ number: 8, title: '5.8: sketch', body: null, headRef: 'feat/other' }
		],
		copies: [
			{ branch: 'main', items: main.items },
			{ branch: 'feat/c2-pages', items: onBranch.items }
		]
	});
	const edges = result.edges.map(show).sort();

	it('draws edges from sources 1 to 5, keeping the most confident', () => {
		expect(edges).toEqual(
			[
				'5.8 → task 5.8 (1)',
				'5.8 → #8 (5)',
				'task 5.8 → #8 (5)',
				'NW9 → feat/nw9-dxf-export (2)',
				'NW9 → #7 (2)',
				'NW9 → task 46 (4)',
				'task 46 → #7 (3)',
				'C2 → feat/c2-pages (2)',
				'C2 → task 12 (4)'
			].sort()
		);
	});

	it('never links the projectmagic branch or its PR', () => {
		expect(edges.join()).not.toMatch(/projectmagic|#41/);
	});

	it('reports dangling references', () => {
		expect(result.dangling).toEqual([
			{ ref: 'ZZ9', source: 2, where: 'branch feat/zz9-ghost' },
			{ ref: '99', source: 4, where: "NW9's Plan: on main" }
		]);
	});
});

describe('link on the fixtures', () => {
	it('lantern: the sketch branch reaches its items through Branch: keys', () => {
		const items = parseBacklog(fixture('lantern', 'backlog.md')).items;
		const tasks = [
			...parseProgress(fixture('lantern', 'PROGRESS.md')).byNumber.keys(),
			...parseProgress(
				fixture('lantern', 'PROGRESS.md', 'feat-sketch-editor')
			).byNumber.keys()
		];
		const { edges, dangling } = link({
			items,
			tasks,
			branches: ['main', 'feat/sketch-editor', 'spec/shaped-parts-decided', 'vercel'].map(
				(name) => ({
					name
				})
			),
			prs: [],
			copies: [{ branch: 'main', items }]
		});
		const toSketch = edges
			.filter((e) => e.to.kind === 'branch' && e.to.name === 'feat/sketch-editor')
			.map((e) => (e.from.kind === 'item' ? e.from.id : ''))
			.sort();
		expect(toSketch).toEqual(['5.10', '5.11', '5.7', '5.8', '5.9']);
		expect(edges.filter((e) => e.source === 1)).toHaveLength(15);
		expect(dangling).toEqual([]);
	});
});
