// Spike 0.2 checks. Usage: node check.mjs backlog.md [backlog.md …] -- PROGRESS.md [PROGRESS.md …]
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import {
  parseBacklog, parseProgress, replaceItem, moveItem, removeItem, itemText,
} from './backlog.mjs';

const args = process.argv.slice(2);
const split = args.indexOf('--');
const backlogs = split < 0 ? args : args.slice(0, split);
const progresses = split < 0 ? [] : args.slice(split + 1);

const ids = (t) => parseBacklog(t).items.map((i) => i.id);
// Every item's text from one parse, rather than one parse per item.
const texts = (t) => Object.fromEntries(parseBacklog(t).items.map((i) => [i.id, t.slice(i.start, i.end)]));

for (const path of backlogs) {
  const bytes = readFileSync(path);
  const t0 = performance.now();
  const text = bytes.toString('utf8');
  const p = parseBacklog(text);
  const n = p.items.length;
  const counts = { checks: 0 };
  const tick = () => counts.checks++;

  // A. Ranges are ordered and disjoint, and every item's text starts with its heading.
  const all = [...p.items, ...p.notes].sort((a, b) => a.start - b.start);
  for (let i = 1; i < all.length; i++) assert.ok(all[i - 1].end <= all[i].start, 'overlap'), tick();
  for (const it of p.items) assert.ok(text.slice(it.start).startsWith('### '), it.id), tick();

  // B. A no-op replacement of every item is byte-identical, including after UTF-8 encoding.
  for (const it of p.items) {
    const out = replaceItem(text, it.id, itemText(text, it.id));
    assert.ok(Buffer.from(out, 'utf8').equals(bytes), `no-op ${it.id}`); tick();
  }

  // C. Editing one item changes only its range: the prefix and suffix are untouched, the id order
  //    is the same, every other item's text is identical, and the new meta line parses.
  for (const it of p.items) {
    const before = texts(text);
    const repl = `### ${it.id} Edited title — PRO\n**Status:** in progress · **Size:** M · **Branch:** \`feat/x\`\n\nNew body, with £ and ★.\n`;
    const out = replaceItem(text, it.id, repl);
    assert.equal(out.slice(0, it.start), text.slice(0, it.start)); tick();
    assert.equal(out.slice(it.start + repl.length), text.slice(it.end)); tick();
    assert.deepEqual(ids(out), ids(text)); tick();
    const q = parseBacklog(out);
    const edited = q.items.find((x) => x.id === it.id);
    assert.deepEqual(edited.meta, { status: 'in progress', size: 'M', branch: 'feat/x' }); tick();
    assert.equal(edited.title, 'Edited title'); tick();
    for (const x of q.items) if (x.id !== it.id) assert.equal(out.slice(x.start, x.end), before[x.id]), tick();
  }

  // D. Moving an item and moving it back is the identity, and a move changes nothing but order.
  //    "Back" is before its old next neighbour in the same section, or after its old previous one.
  const orig = texts(text);
  let skipped = 0;
  for (let i = 0; i < n; i++) {
    const it = p.items[i];
    const next = p.items[i + 1]?.section === it.section ? p.items[i + 1].id : null;
    const prev = p.items[i - 1]?.section === it.section ? p.items[i - 1].id : null;
    if (!next && !prev) { skipped++; continue; }
    const back = next ? { before: next } : { after: prev };
    for (const j of [0, Math.floor(n / 2), n - 1]) {
      if (i === j) continue;
      const target = p.items[j].id;
      for (const to of [{ before: target }, { after: target }]) {
        const moved = moveItem(text, it.id, to);
        const order = ids(moved);
        const want = to.before ? order.indexOf(target) - 1 : order.indexOf(target) + 1;
        assert.equal(order.indexOf(it.id), want, `${it.id} ${JSON.stringify(to)}`); tick();
        const after = texts(moved);
        for (const x of p.items) assert.equal(after[x.id], orig[x.id]), tick();
        assert.equal(moveItem(moved, it.id, back), text, `round trip ${it.id} ${JSON.stringify(to)}`); tick();
      }
    }
  }

  // E. Removing an item removes exactly that id.
  for (const it of p.items) {
    const out = removeItem(text, it.id);
    assert.deepEqual(ids(out), ids(text).filter((x) => x !== it.id)); tick();
  }

  const kinds = p.items.reduce((a, i) => ((a[i.idKind] = (a[i.idKind] ?? 0) + 1), a), {});
  console.log(JSON.stringify({
    file: path, bytes: bytes.length, items: n, idKinds: kinds,
    starred: p.items.filter((i) => i.star).map((i) => i.id),
    withJob: p.items.filter((i) => i.job).length,
    notes: p.notes.map((x) => x.title),
    sections: p.sections.map((s) => s.title),
    warnings: p.warnings.filter((w) => !w.startsWith('no meta')),
    noMeta: p.warnings.filter((w) => w.startsWith('no meta')).length,
    checks: counts.checks,
    moveSkipped: skipped,
    parseMs: (() => { const s = performance.now(); for (let k = 0; k < 20; k++) parseBacklog(text); return +((performance.now() - s) / 20).toFixed(1); })(),
    totalSeconds: +((performance.now() - t0) / 1000).toFixed(1),
  }, null, 2));
}

for (const path of progresses) {
  const tasks = parseProgress(readFileSync(path, 'utf8'));
  const by = tasks.reduce((a, t) => ((a[t.status] = (a[t.status] ?? 0) + 1), a), {});
  console.log(JSON.stringify({
    file: path, tasks: tasks.length, byStatus: by,
    groups: [...new Set(tasks.map((t) => t.group))].length,
    unknown: tasks.filter((t) => t.status === 'unknown').map((t) => `${t.number}: ${t.note.slice(0, 60)}`),
    next: tasks.find((t) => t.status !== 'done' && t.status !== 'skipped'),
  }, null, 2));
}
