# Fixtures

Test data for the core's tests (phase 2): frozen copies of files from the managed repositories
after the phase 1 migration. They are not edits to those repositories; the originals live there.
Copies are frozen on purpose, so tests change when the parser does, not when a backlog does.
Refresh them deliberately, by copying again and updating the table below.

| Path | Source | Commit |
| ---- | ------ | ------ |
| `orchard/main/` | nickwhiteley/orchard `main`, after #35 and #36 | `0a9ae62` |
| `lantern/main/` | nickwhiteley/lantern `main`, after #70 and #71 | `1b202f9` |
| `lantern/feat-sketch-editor/PROGRESS.md` | lantern `feat/sketch-editor` | `9be655b` |

What they exercise:

- **orchard**: 55 items with meta lines (todo, in progress, blocked, built, done), letter ids
  (NW9, A1b, BP3), plan numbers that repeat across tables (the later table wins, §5.3), task 46
  as `built*`, and a meta/plan disagreement (NW7 built, plan task 35 done).
- **lantern**: 24 items, most with plan task numbers as ids (2.6, 5.8), so they link to
  their plan task without a `Plan:` key; `Branch:` keys; a blocked item (9.1).
- **feat-sketch-editor**: a branch copy of `PROGRESS.md` whose rows 3.7 and 5.7–5.11 don't
  exist on `main`, as the in-flight branch case (§7.2 rule 3). That branch has no `backlog.md`.
