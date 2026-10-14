# Spike 0.2: parse with exact offsets, and splice by id

**Passed.** remark (`unified` + `remark-parse` + `remark-gfm`) gives heading and block
positions accurate enough to edit one item and leave every other byte of the file alone. That
was checked against both real backlogs:

| File                          | Items | Notes | Checks | Result |
| ----------------------------- | ----- | ----- | ------ | ------ |
| orchard `backlog.md` (main) | 44   | 12    | 14,167 | pass   |
| lantern `backlog.md` (local, untracked) | 20 | 5 | 3,072 | pass |
| projectmagic `backlog.md`     | 8     | 0     | 547    | pass   |

```
cd spikes/0.2-splice && npm ci
node check.mjs <backlog.md …> -- <PROGRESS.md …>
```

The other repositories' files are copied into `out/`, which is gitignored, and aren't committed
here. Task 1.4 makes them fixtures.

## What is checked, for every item in each file

- **No-op**: replacing an item with its own text gives the original file **byte for byte after
  UTF-8 encoding**. The files contain `★`, `—`, `£` and `×`.
- **Edit isolation**: replacing an item with new text leaves the prefix and suffix identical,
  keeps the id order, leaves every other item's text identical, and the new meta line parses.
- **Move**: before and after three targets each (first, middle and last item). Only the order
  changes, every item's text is identical, and moving it back gives the original file.
- **Remove**: exactly that id disappears.

## What the spec must change

- **Offsets are string indices, not bytes.** remark reports UTF-16 offsets into the decoded
  string. Splicing the string and re-encoding it is exact. §2 and §10 should say "range", not
  "byte range".
- **An item's range ends at its last content block.** A trailing `---` and blank lines belong to
  the gap before the next heading, not to the item. Otherwise moving the last item of a section
  carries the section's `---` with it.
- **A move needs `before` and `after`.** "Before the next item" can't place an item last in its
  section, because the next item is in the next section. Moving the first version of this test
  back into place put F9 under the wrong heading.
- **Cutting the last item in the file takes the blank line before it**, because there is none
  after it. Without this, a round trip adds a blank line at the end of the file.
- **A meta line must begin with `**Status:**`.** Orchard opens NW16 and NW17 with
  `**Specced:** …`, which matched the looser "any `**Key:**`" rule. `**Open:**` and
  `**Decided:**` paragraphs would have matched too.
- **`built` is a real status.** Orchard's `PROGRESS.md` marks 17 tasks `built*`: merged, but
  waiting on a human acceptance check, such as opening DXF output in AutoCAD. Its backlog prose
  says the same ("Built 2026-09-30 … waits only on the lawyer"). It becomes a canonical status
  and a board column between *in review* and *done*. One cell (`9: part`) matches nothing, and
  the migration fixes it.
- **Both "Later" sections are items without ids**: 11 headings in orchard and 4 in
  lantern, reported as notes. The migration gives them ids.
- **Parsing takes about 70 ms** for orchard's 55 KB backlog and 25 ms for lantern's.
  That's fine when cached by blob oid. An edit parses once to locate the item and once to
  verify it.

## Status in the real plans

| File                           | Tasks | done | built | todo | unknown |
| ------------------------------ | ----- | ---- | ----- | ---- | ------- |
| orchard `PROGRESS.md` (main) | 86   | 65   | 17    | 3    | 1       |
| lantern `PROGRESS.md` (main) | 64 | 54 | 0    | 10   | 0       |

Main's lantern plan still shows 0.4 as `todo`, while `feat/sketch-editor` marks it done.
That is exactly the gap between main and a branch that §7.2 exists to show.
