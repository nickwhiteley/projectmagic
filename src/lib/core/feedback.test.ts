import { describe, expect, it } from 'vitest';
import { readFeedback } from './feedback.ts';

describe('readFeedback', () => {
	it('takes a score alone, or a comment alone', () => {
		expect(readFeedback({ score: 4, page: '/p/x' })).toEqual({
			score: 4,
			comment: '',
			page: '/p/x'
		});
		expect(readFeedback({ comment: ' broken ' })).toEqual({
			score: null,
			comment: 'broken',
			page: ''
		});
	});
	it('refuses an empty one, a bad score and a long comment', () => {
		expect(readFeedback({})).toHaveProperty('error');
		expect(readFeedback({ comment: '  ' })).toHaveProperty('error');
		expect(readFeedback({ score: 6 })).toHaveProperty('error');
		expect(readFeedback({ score: 2.5 })).toHaveProperty('error');
		expect(readFeedback({ comment: 'x'.repeat(4001) })).toHaveProperty('error');
	});
	it('keeps only a path on this site', () => {
		expect(readFeedback({ score: 1, page: 'https://evil.example/' })).toMatchObject({ page: '' });
	});
});
