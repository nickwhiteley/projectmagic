// Markdown to HTML for the views (spec §11.3): the same remark pipeline as the parser, then rehype
// with sanitising, because a branch can contain anything an agent wrote. Item ids and plan task
// numbers in the text become links (§9, Docs).
import type { Element, Root as HastRoot, Text as HastText } from 'hast';
import type { Root } from 'mdast';
import rehypeSanitize, { defaultSchema, type Options as SanitizeSchema } from 'rehype-sanitize';
import rehypeStringify from 'rehype-stringify';
import remarkGfm from 'remark-gfm';
import remarkParse from 'remark-parse';
import remarkRehype from 'remark-rehype';
import { unified } from 'unified';
import { visit, SKIP } from 'unist-util-visit';

export interface TocEntry {
	depth: number;
	text: string;
	id: string;
}

export interface RenderOptions {
	/** Give h1–h4 ids and collect them, for a table of contents. */
	toc?: TocEntry[];
	/** Ids and task numbers to link, mapped to their href. */
	links?: Map<string, string>;
	/** For relative links between documents: the document's own path, and how to make an href. */
	docPath?: string;
	docHref?: (path: string) => string;
}

const ID = /\b([A-Z]{1,4}[0-9]+[a-z]?|[0-9]+\.[0-9]+[a-z]?)\b/g;

/** Turns known ids in text into links, outside code, links and headings' anchors. */
function autolink(links: Map<string, string>) {
	return (tree: HastRoot) => {
		visit(tree, 'element', (el: Element) => {
			if (['a', 'code', 'pre'].includes(el.tagName)) return SKIP;
			const out: Element['children'] = [];
			let changed = false;
			for (const child of el.children) {
				if (child.type !== 'text') {
					out.push(child);
					continue;
				}
				const text = (child as HastText).value;
				let last = 0;
				for (const m of text.matchAll(ID)) {
					const href = links.get(m[1]);
					if (!href) continue;
					changed = true;
					if (m.index! > last) out.push({ type: 'text', value: text.slice(last, m.index) });
					out.push({
						type: 'element',
						tagName: 'a',
						properties: { href, className: ['ref'] },
						children: [{ type: 'text', value: m[1] }]
					});
					last = m.index! + m[1].length;
				}
				if (last === 0 && !changed) out.push(child);
				else if (last < text.length) out.push({ type: 'text', value: text.slice(last) });
			}
			if (changed) el.children = out;
		});
	};
}

/** Relative links between documents resolve to the docs view; other relative links are dropped. */
function relativeLinks(docPath: string, docHref: (p: string) => string) {
	const dir = docPath.includes('/') ? docPath.slice(0, docPath.lastIndexOf('/') + 1) : '';
	return (tree: HastRoot) => {
		visit(tree, 'element', (el: Element) => {
			if (el.tagName !== 'a' && el.tagName !== 'img') return;
			const attr = el.tagName === 'a' ? 'href' : 'src';
			const href = el.properties?.[attr];
			if (typeof href !== 'string' || /^[a-z]+:|^#|^\//i.test(href)) return;
			const [path, hash] = href.split('#');
			const parts: string[] = [];
			for (const seg of (dir + path).split('/')) {
				if (seg === '..') parts.pop();
				else if (seg && seg !== '.') parts.push(seg);
			}
			el.properties[attr] = docHref(parts.join('/')) + (hash ? `#${hash}` : '');
		});
	};
}

const slug = (text: string) =>
	text
		.toLowerCase()
		.replace(/[^\p{L}\p{N}\s-]/gu, '')
		.trim()
		.replace(/\s+/g, '-') || 'section';

function headingIds(toc: TocEntry[]) {
	return (tree: HastRoot) => {
		const used = new Map<string, number>();
		visit(tree, 'element', (el: Element) => {
			const m = el.tagName.match(/^h([1-4])$/);
			if (!m) return;
			const text = textOf(el);
			const base = slug(text);
			const n = used.get(base) ?? 0;
			used.set(base, n + 1);
			const id = n ? `${base}-${n}` : base;
			el.properties = { ...el.properties, id };
			toc.push({ depth: Number(m[1]), text, id });
		});
	};
}

function textOf(node: Element | HastText): string {
	if (node.type === 'text') return node.value;
	return node.children
		.map((c) => (c.type === 'text' || c.type === 'element' ? textOf(c) : ''))
		.join('');
}

const schema: SanitizeSchema = {
	...defaultSchema,
	attributes: {
		...defaultSchema.attributes,
		code: [...(defaultSchema.attributes?.code ?? []), ['className', /^language-./]]
	}
};

export function renderMarkdown(markdown: string, options: RenderOptions = {}): string {
	const processor = unified()
		.use(remarkParse)
		.use(remarkGfm)
		.use(remarkRehype)
		.use(rehypeSanitize, schema);
	if (options.docPath !== undefined && options.docHref)
		processor.use(relativeLinks, options.docPath, options.docHref);
	if (options.links?.size) processor.use(autolink, options.links);
	if (options.toc) processor.use(headingIds, options.toc);
	const tree = processor.runSync(processor.parse(markdown) as Root) as HastRoot;
	return unified().use(rehypeStringify).stringify(tree);
}

/** One line of markdown, such as a title or a waiting reason, without the paragraph around it. */
export function renderInline(markdown: string, options: RenderOptions = {}): string {
	return renderMarkdown(markdown, options).replace(/^<p>([\s\S]*)<\/p>\s*$/, '$1');
}
