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
  human acceptance check) or `done`. Use `**Waiting:**` to say what a blocked or built item
  waits on, and `**Plan:**` for the `PROGRESS.md` tasks that build it. `Type` (`feature` or
  `bug`) and `Epic` are accepted too. **Keep the meta line current** whenever the prose about
  the item's state changes.
- **`**For:**` says who an item is for**: `person`, `person.<github-login>`, `agent`,
  `agent.<maker>` or `agent.<maker>.<family>`. You are `agent.<maker>.<family>`, worked out from
  your own model with no version: Claude Opus is `agent.claude.opus`. A path covers everything
  below it, and no `For:` means anyone's.
  - **Work only on items for you, for a path above you, or for no one**: as
    `agent.claude.opus`, that is `agent.claude.opus`, `agent.claude`, `agent` or no `For:`.
    Leave items for another agent or for a person alone.
  - **You may hand an item to a person**, such as one you are blocked on, by setting `For:` to
    them. Take an item that is for a person only when they say so, and then set `For:` to you.
  - **When you set an item to `built` and it needs a person to check it**, set `For:` to that
    person: `person`, or `person.<login>` when you know who.
- **When you start an item**, set `Status: in progress` and `Branch:` on your branch's copy
  of `backlog.md` in your first commit, and **push the branch straight away**. A branch that
  exists only on this machine is invisible to Project Magic.
- **Name branches `<type>/<ref>-<slug>`**: the type is `feat`, `fix`, `spike`, `spec`,
  `chore` or `docs`, and the ref is the item id in lower case or the `PROGRESS.md` task
  number. For example, `feat/nw9-dxf-export` or `feat/5.7-sketch-part-editor`.
- **Every PR body includes `Backlog: <ids>` and/or `Plan: <task numbers>`.** A PR that fixes a
  bug also says where the bug was found, `Bug: production`, `Bug: preview` or `Bug: development`,
  and, for production, `Raised: <date and time>` when it was first noticed, if known.
- **In `PROGRESS.md` plan tables, every status cell begins with** `done`, `todo`,
  `in progress`, `blocked`, `built` (or `built*`) or `skipped` (bold is fine), with any note
  after a colon.
- **Never use the branch name `projectmagic`.** It is reserved for Project Magic's own edits to
  this repository, which reach main through a PR from it.
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
