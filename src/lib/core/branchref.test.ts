import { describe, expect, it } from 'vitest';
import { parseBranchName, parsePrText } from './branchref';

describe('parseBranchName', () => {
	it.each([
		['feat/nw9-dxf-export', { type: 'feat', ref: 'NW9', slug: 'dxf-export' }],
		['fix/a3-gate-off-by-one', { type: 'fix', ref: 'A3', slug: 'gate-off-by-one' }],
		['feat/a1a-billing', { type: 'feat', ref: 'A1a', slug: 'billing' }],
		['spike/0.6-ollama-latency', { type: 'spike', ref: '0.6', slug: 'ollama-latency' }],
		['feat/5.7-sketch-part-editor', { type: 'feat', ref: '5.7', slug: 'sketch-part-editor' }],
		['spec/pm9-delivery-metrics', { type: 'spec', ref: 'PM9', slug: 'delivery-metrics' }],
		['chore/plinth-v0.4.0', { type: 'chore', ref: null, slug: 'plinth-v0.4.0' }],
		['feat/sketch-editor', { type: 'feat', ref: null, slug: 'sketch-editor' }],
		['feat/comments', { type: 'feat', ref: null, slug: 'comments' }],
		['docs/fm3', { type: 'docs', ref: 'FM3', slug: '' }]
	])('%s', (name, want) => expect(parseBranchName(name)).toEqual(want));

	it.each([
		'main',
		'vercel',
		'projectmagic',
		'product-notes-2',
		'dependabot/npm/vite-8',
		'Feat/nw9-x'
	])('%s is outside the convention', (name) => expect(parseBranchName(name)).toBeNull());
});

describe('parsePrText', () => {
	it('reads the lines, wherever they are in the body', () => {
		const t = parsePrText(
			'Fix the gate',
			'Some prose.\n\nBacklog: A3, NW9 (the export part)\nPlan: 5.7, 5.8\n**Bug:** Production\nRaised: 2026-10-12 09:30\n'
		);
		expect(t).toEqual({
			backlog: ['A3', 'NW9'],
			plan: ['5.7', '5.8'],
			bug: 'production',
			raised: '2026-10-12 09:30',
			titleId: null
		});
	});

	it('reads an id at the start of the title only before a colon', () => {
		expect(parsePrText('NW9: DXF export', null).titleId).toBe('NW9');
		expect(parsePrText('2.2: the backlog parser', null).titleId).toBe('2.2');
		expect(parsePrText('3 small fixes', null).titleId).toBeNull();
	});

	it('ignores what isn’t an id or a known environment', () => {
		const t = parsePrText('x', 'Backlog: none\nPlan: NW9, 46\nBug: staging');
		expect(t).toMatchObject({ backlog: [], plan: ['46'], bug: null, raised: null });
	});
});
