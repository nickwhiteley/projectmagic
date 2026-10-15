import { describe, expect, it } from 'vitest';
import { cleanPath, imageType } from './image.ts';

describe('imageType', () => {
	it('serves common image types, whatever the case', () => {
		expect(imageType('docs/a.png')).toBe('image/png');
		expect(imageType('A.JPG')).toBe('image/jpeg');
		expect(imageType('x/y.svg')).toBe('image/svg+xml');
	});
	it('refuses anything else, so a document cannot be fetched as an image', () => {
		expect(imageType('docs/a.html')).toBeNull();
		expect(imageType('README.md')).toBeNull();
		expect(imageType('noext')).toBeNull();
	});
});

describe('cleanPath', () => {
	it('keeps a path inside the repository', () => {
		expect(cleanPath('docs/img/a.png')).toBe('docs/img/a.png');
	});
	it('rejects a path that climbs, is empty or has odd segments', () => {
		for (const p of ['', '../a.png', 'a/../b.png', '/a.png', 'a//b.png', 'a/./b.png', 'a\\b.png'])
			expect(cleanPath(p), p).toBeNull();
	});
});
