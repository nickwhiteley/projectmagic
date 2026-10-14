// Spike 0.2: a backlog parser that keeps exact source offsets, and splices by id.
// Offsets are indices into the decoded JS string (UTF-16 code units), which is what remark's
// positions are. Splicing the string and re-encoding it as UTF-8 reproduces the file exactly.

import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';

const parser = unified().use(remarkParse).use(remarkGfm);

export const LETTER_ID = /^[A-Z]{1,4}[0-9]+[a-z]?$/;
export const TASK_ID = /^[0-9]+(\.[0-9]+)*[a-z]?$/;

const plain = (node) =>
  node.type === 'text' || node.type === 'inlineCode'
    ? node.value
    : (node.children ?? []).map(plain).join('');

// "**Status:** in progress · **Size:** M · **Branch:** `x`" → { status, size, branch }
export function parseMeta(paragraph, text) {
  const src = text.slice(paragraph.position.start.offset, paragraph.position.end.offset);
  // It must lead with Status: Orchard opens items with "**Specced:** …" and "**Decided:** …",
  // which are prose, not meta.
  if (!/^\*\*Status:\*\*/i.test(src) || src.includes('\n\n')) return null;
  const meta = {};
  for (const part of src.split(/\s+·\s+/)) {
    const m = part.match(/^\*\*([A-Za-z]+):\*\*\s*(.*)$/s);
    if (!m) return null;
    meta[m[1].toLowerCase()] = m[2].trim().replace(/^`(.*)`$/, '$1');
  }
  return meta;
}

function parseHeading(title) {
  // The star sits before or after the id in practice: "★ C1 …" and "C1 ★ …" both occur.
  const star = title.includes('★');
  const t = title.replace('★', ' ').trim();
  const [first, ...rest] = t.split(/\s+/);
  const id = LETTER_ID.test(first) || TASK_ID.test(first) ? first : null;
  let name = id ? rest.join(' ') : t;
  let job = null;
  const j = name.match(/\s+—\s+([A-Z]+)$/);
  if (j) { job = j[1]; name = name.slice(0, j.index); }
  return { id, idKind: id ? (LETTER_ID.test(id) ? 'letter' : 'task') : null, title: name, job, star };
}

// The end of a block: the end of its last content node, plus the newline after it. Thematic
// breaks (`---`) and blank lines between blocks belong to the gap, not to the item before them.
function blockEnd(nodes, text) {
  const content = nodes.filter((n) => n.type !== 'thematicBreak');
  if (!content.length) return null;
  let end = content.at(-1).position.end.offset;
  if (text[end] === '\n') end++;
  return end;
}

export function parseBacklog(text) {
  const tree = parser.parse(text);
  const nodes = tree.children;
  const items = [], notes = [], sections = [], warnings = [];
  let section = null;

  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i];
    if (n.type !== 'heading' || n.depth > 3) continue;
    const start = n.position.start.offset;
    const body = [];
    for (let k = i + 1; k < nodes.length; k++) {
      const m = nodes[k];
      if (m.type === 'heading' && m.depth <= 3) break;
      body.push(m);
    }
    const end = blockEnd([n, ...body], text);

    if (n.depth <= 2) {
      if (n.depth === 2) {
        section = { title: plain(n), start };
        sections.push(section);
      }
      continue;
    }
    const h = parseHeading(plain(n));
    const meta = body[0]?.type === 'paragraph' ? parseMeta(body[0], text) : null;
    const entry = { ...h, section: section?.title ?? null, start, end, meta };
    if (h.id) items.push(entry);
    else notes.push(entry);
    if (/^\S+\s+\+\s+\S+/.test(plain(n))) warnings.push(`compound heading: ${plain(n)}`);
    if (h.id && !meta) warnings.push(`no meta: ${h.id}`);
  }
  const seen = new Set();
  for (const it of items) {
    if (seen.has(it.id)) warnings.push(`duplicate id: ${it.id}`);
    seen.add(it.id);
  }
  return { items, notes, sections, warnings };
}

// The pure edit operations. Each finds the item by id in *this* text, never in a cached parse.
const find = (text, id) => {
  const it = parseBacklog(text).items.find((x) => x.id === id);
  if (!it) throw new Error(`no item ${id}`);
  return it;
};

export function replaceItem(text, id, replacement) {
  const it = find(text, id);
  if (!replacement.endsWith('\n')) replacement += '\n';
  return text.slice(0, it.start) + replacement + text.slice(it.end);
}

// Move an item to sit immediately before or after another: `{ before: id }` or `{ after: id }`.
// Items are separated by one blank line, which travels with the item. Every byte of the item is
// preserved. `after` is what places an item last in its section, before a `---` or the next `##`.
// The range to cut when an item leaves its place: the item and the blank lines after it, or,
// when nothing follows (the end of the file), the blank lines before it.
function cutRange(text, it) {
  let end = it.end;
  while (text[end] === '\n') end++;
  if (end < text.length || end > it.end) return [it.start, end];
  let start = it.start;
  while (start > 1 && text[start - 1] === '\n' && text[start - 2] === '\n') start--;
  return [start, end];
}

export function moveItem(text, id, to) {
  const it = find(text, id);
  const [cs, ce] = cutRange(text, it);
  const block = text.slice(it.start, it.end);
  const without = text.slice(0, cs) + text.slice(ce);
  if (to.before) {
    const target = find(without, to.before);
    return without.slice(0, target.start) + block + '\n' + without.slice(target.start);
  }
  const target = find(without, to.after);
  return without.slice(0, target.end) + '\n' + block + without.slice(target.end);
}

export function removeItem(text, id) {
  const [cs, ce] = cutRange(text, find(text, id));
  return text.slice(0, cs) + text.slice(ce);
}

export function itemText(text, id) {
  const it = find(text, id);
  return text.slice(it.start, it.end);
}

// PROGRESS.md: plan tables are GFM tables whose first header is `#` and that have a Status column.
// `built` is Orchard's `built*`: merged, waiting on a human acceptance check.
const STATUS = /^(done|todo|in progress|blocked|skipped|built)\b\\?\*?/i;

export function parseProgress(text) {
  const tree = parser.parse(text);
  const tasks = [];
  let group = null;
  for (const n of tree.children) {
    if (n.type === 'heading') group = plain(n);
    if (n.type !== 'table') continue;
    const header = n.children[0].children.map((c) => plain(c).trim());
    const si = header.findIndex((h) => h.toLowerCase() === 'status');
    if (header[0] !== '#' || si < 0) continue;
    for (const row of n.children.slice(1)) {
      const cells = row.children.map((c) => plain(c).trim());
      const raw = cells[si] ?? '';
      const m = raw.match(STATUS);
      tasks.push({
        number: cells[0], group,
        title: cells[1],
        status: m ? m[1].toLowerCase() : 'unknown',
        note: m ? raw.slice(m[0].length).replace(/^[\s:,.–—-]+/, '') : raw,
      });
    }
  }
  return tasks;
}
