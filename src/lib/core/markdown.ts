// The one markdown parser the core uses: remark with GFM, for position-accurate headings and
// tables (spec §12). Offsets are indices into the decoded string (UTF-16 code units), which is
// what remark reports; splicing the string and re-encoding it reproduces the file (spike 0.2).
import type { Nodes, Root } from 'mdast';
import remarkGfm from 'remark-gfm';
import remarkParse from 'remark-parse';
import { unified } from 'unified';

const processor = unified().use(remarkParse).use(remarkGfm);

export function parseMarkdown(text: string): Root {
	return processor.parse(text);
}

/** A node's text without markup: `**a** \`b\`` → `a b`. */
export function plain(node: Nodes): string {
	if (node.type === 'text' || node.type === 'inlineCode') return node.value;
	if ('children' in node) return node.children.map((c) => plain(c as Nodes)).join('');
	return '';
}

export function startOf(node: Nodes): number {
	return node.position!.start.offset!;
}

export function endOf(node: Nodes): number {
	return node.position!.end.offset!;
}

/** 1-based line numbers for offsets, computed once per text. */
export function lineIndex(text: string): (offset: number) => number {
	const starts = [0];
	for (let i = 0; i < text.length; i++) if (text[i] === '\n') starts.push(i + 1);
	return (offset) => {
		let lo = 0;
		let hi = starts.length - 1;
		while (lo < hi) {
			const mid = (lo + hi + 1) >> 1;
			if (starts[mid] <= offset) lo = mid;
			else hi = mid - 1;
		}
		return lo + 1;
	};
}
