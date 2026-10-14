# Design

`stitch-prompt.md` holds the prompts given to Google Stitch on 2026-10-14. Its screens (a
screenshot and generated HTML for each) guided phase 4; they are not kept in the repository,
because their sample data came from private projects. `spec.md` §9 and §16 are the authority on
what each screen contains; the notes below record what was kept from the designs, and what was
corrected.

Screens: 1 Overview, 2 List, 3 Board, 4 Item, 5 Edit drawer, 6 Plan, 7 Docs, 8 Delivery, and three
off-brief extras (an acceptance queue, a cut-line view and a project dashboard).

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

- **Agent control that Project Magic doesn't have.** Drop "autonomous dispatch" (also under
  the logo), Run Swarm,
  Dispatch Next Cycle, Approve Direction, Pause Ingestion, agent names and activity, token burn,
  PRs per day, release tags. Project Magic reads the files and edits them, nothing more.
- **Status colours.** Exactly six statuses, each one colour (§9, base prompt): todo neutral, in
  progress blue, blocked amber, in review violet, built teal, done green. The designs make built
  blue, blocked sometimes red, and invent "parked".
- **The cut line as a divider.** In the backlogs ★ marks individual items; there is no line
  between sections. Keep the per-item ★ and drop the divider.
- **Edit drawer (5).** The select fields' text is clipped in the mock (a rendering fault, not
  the design). The conflict diff shows the item's markdown, meta line included, not YAML-like
  `status:` lines.
- **Delivery (8).** Size weights are S=1, M=3, L=8 (§16), not 1, 2, 4. No red or green on the CI
  chart: trends, not targets.
- **Plan (6).** Disagreement cards may link to the edit, but nothing resolves one automatically
  (§7.2).
- **The sample data** is invented (titles, PR numbers, statuses); build against `fixtures/`.
