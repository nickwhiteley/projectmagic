# Backlog and branch conventions

**Paste the block below into each repository's `CLAUDE.md`.** It is the agent-facing form of
`spec.md` §5, and if the two disagree, `spec.md` wins. Project Magic reads these files to show
the project's state. Following the conventions is what makes that view accurate.

---

```markdown
## Backlog, plan and branch conventions

Project Magic reads `backlog.md`, `PROGRESS.md`, branches and PRs to show this project's state.
Keep to these conventions so it reads them correctly:

- **Every backlog item is a `###` heading starting with a unique id**: a letter id
  (`### NW9 DXF export — PRO`, `### FM3 …`) or, for an item that holds the reasoning for a
  `PROGRESS.md` task, that task's number (`### 5.8 New sketch piece — DESIGN`). Never reuse an
  id, even after the item ships. One id per heading. Headings without an id are notes, not
  items, so give every real item an id.
- **The first line under the heading is the meta line**. It begins with `**Status:**`, then
  `**Key:** value` pairs joined by ` · `:

      **Status:** in progress · **Size:** M · **Branch:** `feat/nw9-dxf-export` · **Plan:** 35

  Status is one of `todo`, `in progress`, `blocked`, `in review`, `built` (merged, waiting on a
  human acceptance check) or `done`. Use `**Waiting:**`
  to say what a blocked item waits on. `Type` (`feature` or `bug`) and `Epic` are accepted too.
- **When you start an item**, set `Status: in progress` and `Branch:` on your branch's copy
  of `backlog.md` in your first commit, and **push the branch straight away**. A branch that
  exists only on this machine is invisible to Project Magic.
- **Name branches `<type>/<ref>-<slug>`**: the type is `feat`, `fix`, `spike`, `spec`,
  `chore` or `docs`, and the ref is the item id in lower case or the `PROGRESS.md` task
  number. For example, `feat/nw9-dxf-export` or `feat/5.7-sketch-part-editor`.
- **Every PR body includes `Backlog: <ids>` and/or `Plan: <task numbers>`.**
- **In `PROGRESS.md` plan tables, every status cell begins with** `done`, `todo`,
  `in progress`, `blocked`, `built` (or `built*`) or `skipped` (bold is fine), with any note
  after a colon.
- **Shipped items are still removed from `backlog.md`.** Their completion is read from git
  history.
```

---

## Migrating an existing backlog

Do this once per repository, on a branch `chore/backlog-conventions`, as one reviewed PR:

1. Give every item heading exactly one id. Split or renumber compound headings like
   `E5 + E6 residual`. Give ids to the items under *Later* that have none (11 in orchard,
   4 in lantern).
2. Add a meta line under each item, and move a leading size and status out of the prose
   (`**S–M. In progress.**`) into it. Take the status from the prose:
   - "Built … waits on the lawyer" becomes `blocked` with a `Waiting:` key;
   - an item with a matching branch becomes `in progress` with a `Branch:` key.
3. Add `Branch:` to items whose work is on an existing branch that predates the naming rule.
4. Make sure every `PROGRESS.md` status cell begins with a canonical word.
5. Add `.projectmagic.yml` if any default in `spec.md` §4 is wrong for the repository, for
   example to exclude `specs/archive/**` from the docs.
6. Add the block above to `CLAUDE.md`.
