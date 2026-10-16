import { describe, expect, it } from 'vitest';
import { askPrompt, digest, linkAnswer } from './ask.ts';
import type { ProjectState } from './state.ts';

const NOW = Date.parse('2026-10-14T12:00:00Z');
const item = (id: string, over: object = {}) => ({
	id,
	status: 'todo',
	titleText: `Item ${id}`,
	waiting: null,
	assignee: null,
	epic: null,
	type: null,
	size: null,
	branches: [],
	prs: [],
	...over
});
const state = (repo: string, items: object[], done: object[] = []): ProjectState =>
	({
		repo,
		name: repo.toUpperCase(),
		hasBacklog: true,
		inferenceAllowed: true,
		batchEdits: false,
		items,
		done
	}) as unknown as ProjectState;

describe('digest', () => {
	const d = digest(
		[
			state(
				'orchard',
				[
					item('B1', {
						status: 'built',
						titleText: 'Invoices\nas PDF',
						waiting: 'the lawyer',
						assignee: 'person.nick',
						branches: [{ name: 'feat/b1' }],
						prs: [{ number: 7, state: 'OPEN' }]
					}),
					item('B2')
				],
				[
					{ id: 'B0', title: '**Old** thing', at: '2026-10-01T00:00:00Z' },
					{ id: 'A9', title: 'Ancient', at: '2026-01-01T00:00:00Z' }
				]
			),
			{ ...state('plinth', []), hasBacklog: false } as ProjectState
		],
		NOW
	);

	it('lists each item with its status and details, one line each', () => {
		expect(d.text).toContain('## orchard (ORCHARD)');
		expect(d.text).toContain(
			'- B1 [built] Invoices as PDF | waiting: the lawyer | for: person.nick | branches: feat/b1 | PRs: #7 open'
		);
		expect(d.text).toContain('- B2 [todo] Item B2');
	});
	it('includes items shipped in the last 30 days, and nothing older', () => {
		expect(d.text).toContain('- B0 [shipped 2026-10-01] Old thing');
		expect(d.text).not.toContain('A9');
	});
	it('skips a project with no backlog, and knows only what it listed', () => {
		expect(d.text).not.toContain('plinth');
		expect([...d.known].sort()).toEqual(['orchard:B0', 'orchard:B1', 'orchard:B2']);
		expect(d.truncated).toBe(false);
	});
	it('says what it left out when the budget runs short', () => {
		const many = state(
			'big',
			Array.from({ length: 200 }, (_, i) => item(`B${i}`))
		);
		const t = digest([many, state('small', [item('S1')])], NOW, 2000);
		expect(t.truncated).toBe(true);
		expect(t.text).toMatch(/\(\d+ more items not shown\)/);
		expect(t.text).toContain('S1'); // the small project still has its share
		expect(t.text.length).toBeLessThan(2600);
	});
});

describe('askPrompt', () => {
	it('puts the question and the digest in the user message', () => {
		const p = askPrompt('What is  blocked?', { text: 'D', known: new Set(), truncated: true });
		expect(p.user).toContain('Question: What is blocked?');
		expect(p.user).toContain('Digest:\n\nD');
		expect(p.user).toContain('incomplete');
		expect(p.system).toContain('[repo:ID]');
	});
	it('says who is asking, so "me" means someone (PM4)', () => {
		const p = askPrompt(
			'What is waiting on me?',
			{ text: 'D', known: new Set(), truncated: false },
			'nickwhiteley'
		);
		expect(p.user).toContain('Asked by: nickwhiteley');
		expect(p.user).toContain('for: person.nickwhiteley');
		expect(p.system).toContain('"Me" and "my"');
	});
});

describe('linkAnswer', () => {
	const known = new Set(['orchard:B7', 'lantern:5.8']);
	it('links a citation to an item that is in the digest', () => {
		const names = new Map([['orchard', 'Orchard']]);
		expect(linkAnswer('See [orchard:B7] and [lantern:5.8].', known, names)).toBe(
			'See [Orchard B7](/p/orchard/i/B7) and [lantern 5.8](/p/lantern/i/5.8).'
		);
	});
	it('does not link an item the digest never named, so a made-up or injected link is dead', () => {
		expect(linkAnswer('See [orchard:B99] and [evil.example:x].', known)).toBe('See B99 and x.');
	});
});
