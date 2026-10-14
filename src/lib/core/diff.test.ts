import { describe, expect, it } from 'vitest';
import { diffLines } from './diff.ts';

describe('diffLines', () => {
	it('marks the changed line, keeping the rest', () => {
		const a = '### NW9 DXF\n**Status:** todo\n\nBody.\n';
		const b = '### NW9 DXF\n**Status:** in progress · **Branch:** `feat/nw9`\n\nBody.\nMore.\n';
		expect(diffLines(a, b)).toEqual([
			{ kind: 'same', text: '### NW9 DXF' },
			{ kind: 'del', text: '**Status:** todo' },
			{ kind: 'add', text: '**Status:** in progress · **Branch:** `feat/nw9`' },
			{ kind: 'same', text: '' },
			{ kind: 'same', text: 'Body.' },
			{ kind: 'add', text: 'More.' }
		]);
	});

	it('is all same for equal text, and handles empty sides', () => {
		expect(diffLines('a\nb', 'a\nb').every((l) => l.kind === 'same')).toBe(true);
		expect(diffLines('', 'x')).toEqual([
			{ kind: 'del', text: '' },
			{ kind: 'add', text: 'x' }
		]);
	});
});
