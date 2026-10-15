import { describe, expect, it } from 'vitest';
import { renderMarkdown } from './render.ts';

describe('renderMarkdown', () => {
	it('renders GFM', () => {
		expect(renderMarkdown('**bold** and `code`\n\n| a | b |\n|---|---|\n| 1 | 2 |')).toMatch(
			/<strong>bold<\/strong> and <code>code<\/code>[\s\S]*<table>/
		);
	});

	it('removes scripts, handlers and javascript: links', () => {
		const html = renderMarkdown(
			'<script>alert(1)</script>\n\n<img src=x onerror="alert(1)">\n\n[x](javascript:alert(1))'
		);
		expect(html).not.toMatch(/script|onerror|javascript:/);
	});

	it('links known ids and task numbers, but not in code or existing links', () => {
		const links = new Map([
			['NW9', '/p/orchard/i/NW9'],
			['5.8', '/p/lantern/i/5.8']
		]);
		const html = renderMarkdown('See NW9 and 5.8, not NW10. `NW9` [NW9](https://x)', { links });
		expect(html).toContain('<a href="/p/orchard/i/NW9" class="ref">NW9</a>');
		expect(html).toContain('<a href="/p/lantern/i/5.8" class="ref">5.8</a>');
		expect(html).toContain('<code>NW9</code>');
		expect(html).toContain('<a href="https://x">NW9</a>');
		expect(html).not.toContain('>NW10<');
	});

	it('resolves relative links between documents', () => {
		const html = renderMarkdown(
			'[engine](../specs/engine.md#joints) [web](https://a.b) [top](#x)',
			{
				docPath: 'docs/guide.md',
				docHref: (p) => `/p/r/docs/${p}`
			}
		);
		expect(html).toContain('href="/p/r/docs/specs/engine.md#joints"');
		expect(html).toContain('href="https://a.b"');
		expect(html).toContain('href="#x"');
	});

	it('sends relative images to the image route, and leaves links alone (PM21)', () => {
		const html = renderMarkdown(
			'![a](img/a.png) ![b](../b.svg) ![c](https://a.b/c.png) [d](d.md)',
			{
				docPath: 'docs/guide.md',
				docHref: (p) => `/p/r/docs/${p}`,
				imgHref: (p) => `/p/r/raw/${p}`
			}
		);
		expect(html).toContain('src="/p/r/raw/docs/img/a.png"');
		expect(html).toContain('src="/p/r/raw/b.svg"');
		expect(html).toContain('src="https://a.b/c.png"');
		expect(html).toContain('href="/p/r/docs/docs/d.md"');
	});

	it('keeps the language class on a code fence, so mermaid can find its diagrams (PM8)', () => {
		const html = renderMarkdown('```mermaid\ngraph TD\n  A-->B\n```');
		expect(html).toContain('<pre><code class="language-mermaid">');
		expect(html).toContain('A-->B');
	});

	it('gives headings ids and collects a table of contents', () => {
		const toc: { depth: number; text: string; id: string }[] = [];
		const html = renderMarkdown(
			'# Spec\n\n## 1. What it is\n\n## 1. What it is\n\n### `code` here',
			{ toc }
		);
		expect(toc).toEqual([
			{ depth: 1, text: 'Spec', id: 'spec' },
			{ depth: 2, text: '1. What it is', id: '1-what-it-is' },
			{ depth: 2, text: '1. What it is', id: '1-what-it-is-1' },
			{ depth: 3, text: 'code here', id: 'code-here' }
		]);
		expect(html).toContain('<h2 id="1-what-it-is">');
	});
});
