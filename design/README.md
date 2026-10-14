# Design

`stitch-prompt.md` holds the prompts. `stitch/` holds what Google Stitch made from them on
2026-10-14 (Stitch project *Project Magic Dashboard*, `10283283995411976360`): a 1280-wide
screenshot and the generated HTML for each screen. `spec.md` §9 and §16 remain the authority on
what each screen contains; the designs are the authority on how it looks, with the corrections
below.

| Screen | Files |
| ------ | ----- |
| 1 Overview | `stitch/1-overview.*` |
| 2 List | `stitch/2-list.*` |
| 3 Board | `stitch/3-board.*` |
| 4 Item | `stitch/4-item.*` |
| 5 Edit drawer | `stitch/5-edit.*`, incomplete: to regenerate |
| 6 Plan | `stitch/6-plan.*` |
| 7 Docs | `stitch/7-docs.*` |
| 8 Delivery | `stitch/8-delivery.*` |
| Extras, off-brief | `stitch/x-hyperscale.*`, `stitch/x-cutline.*`, `stitch/x-awaiting.*` |

## Keep

- **The visual language**: serif headings and long prose, a clean sans for UI, monospace for
  ids, branches and hashes; warm neutral surfaces; status pills with labels; restrained colour.
- **The shell**: left sidebar of projects and views, top bar with ⌘K search, the sync indicator
  and the avatar; tabs with counts.
- **List (2)**: the row (pill, id, ★, title, job, size, then the muted status-source line), rows
  that expand in place, notes as quieter prose, section headings with their italic intro line.
- **Item (4)**: wide body and narrow side panel (status and since when, waiting, meta, linked
  branches, PRs and plan tasks, history); the main-versus-branch diff below.
- **Plan (6)**: phases collapsed when done, with progress; task rows with link chips to items;
  the disagreements rail.
- **Docs (7)**: the tree, branch picker, sticky contents, and hover cards on ids in the text.
- **Delivery (8)**: the four figures with sparklines, the founder queue, the production bugs
  table.
- **From the extras**: the acceptance queue's Accept button, now backlog PM10.

## Ignore or correct

- **Agent control that Project Magic doesn't have.** Drop "autonomous dispatch", Run Swarm,
  Dispatch Next Cycle, Approve Direction, Pause Ingestion, agent names and activity, token burn,
  PRs per day, release tags. Project Magic reads the files and edits them, nothing more.
- **Status colours.** Exactly six statuses, each one colour (§9, base prompt): todo neutral, in
  progress blue, blocked amber, in review violet, built teal, done green. The designs make built
  blue, blocked sometimes red, and invent "parked".
- **The cut line as a divider.** In the backlogs ★ marks individual items; there is no line
  between sections. Keep the per-item ★ and drop the divider.
- **Edit drawer (5).** Only the conflict banner and the footer were drawn; it needs the fields
  and the markdown editor. Its footer is wrong: edits go to `main` through the `projectmagic`
  branch, whose PR merges straight away (§10), not a "Backlog edits" PR "because main is
  protected".
- **Delivery (8).** Size weights are S=1, M=3, L=8 (§16), not 1, 2, 4. No red or green on the CI
  chart: trends, not targets.
- **Plan (6).** Disagreement cards may link to the edit, but nothing resolves one automatically
  (§7.2).
- **The sample data** is invented (titles, PR numbers, statuses); build against `fixtures/`.
