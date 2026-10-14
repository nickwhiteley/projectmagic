# Build progress

The durable task tracker. **Update the status table as work completes, in the same commit as the
work.** This file, not an in-session task list, is what survives a context reset.

Read `spec.md` first: it is authoritative.

## How to resume

1. Read `spec.md`, then this file.
2. Pick the lowest-numbered task that isn't `done` and whose dependencies are.
3. Work on a branch named by `specs/conventions.md` (`feat/2.1-backlog-parser`). Write tests
   first.
4. Mark the task here in the same commit.

## Build plan

The order proves the risky parts first. Phase 0 checks the two assumptions the design depends
on. Phase 1 puts the conventions into the real repositories early, so the parser is built
against real annotated files. Phases 2–4 deliver the read-only tool, which is most of the
value. Phase 5 adds editing.

Sizes are rough: S is about half a day of agent work, M is a day or two.

### Phase 0: spikes

| #   | Task | Proves | Status |
|-----|------|--------|--------|
| 0.1 | One GraphQL query per repository: all branches with ahead and behind counts and PRs, plus `backlog.md`/`PROGRESS.md` text on main and every active branch, against Orchard and Lantern. Record the query cost, latency and the pagination needed. **S** | §7.1 fits in one or two calls and well inside the rate limit | **done**: passed. Two calls and 2 points per repository, about 1.7 s, and a webhook sync is usually one call. Only pushed branches are visible, so the conventions now ask for a push at the start. See `spikes/0.1-graphql/RESULT.md`. |
| 0.2 | Parse today's Orchard `backlog.md` with remark, locate every `###` item by byte offset, and show that a no-op splice of each item round-trips byte for byte. **S** | §2 "edits are surgical" is achievable with remark's positions | **done**: passed, with 17,786 checks over three real backlogs, all byte-identical. It changed the spec: meta lines must begin with `**Status:**`, `built` is a status, and moves need `before` and `after`. See `spikes/0.2-splice/RESULT.md`. |

### Phase 1: conventions in the real repositories

| #   | Task | Status |
|-----|------|--------|
| 1.1 | Settle the first draft's open questions with Nick, and fold the answers in | **done**: `spec.md` §14 (2026-10-14) |
| 1.2 | Orchard: migrate `backlog.md` (one id per heading, meta lines, `Branch:` on in-flight items), normalise `PROGRESS.md` status cells, add the `CLAUDE.md` block. One PR on `chore/backlog-conventions`. **M** | **in progress**: orchard#35 is open. 55 items with meta lines and 0 warnings; NW21–NW31 assigned; E5 + E6 became E5; task 46's missing row restored. It found two spec rules: plan numbers repeat across tables, and an item's meta must beat its plan task (§5.2, §7.2). |
| 1.3 | Lantern: commit the new `backlog.md` (currently untracked on `feat/sketch-editor`), then the same as 1.2. Give the *Later* headings `FM` ids, move each item's leading `**S–M. In progress.**` into its meta line, and add `.projectmagic.yml` with `new_id_prefix: FM`. **S** | **in progress**: lantern#70 is open. 24 items with meta lines and 0 warnings; FM6–FM9 assigned; `PROGRESS.md` needed no change. |
| 1.4 | Copy the post-migration files from both repositories into `fixtures/`, once orchard#35 and lantern#70 merge | todo |

### Phase 2: the pure core (`src/lib/core/`)

| #   | Task | Status |
|-----|------|--------|
| 2.1 | Scaffold: SvelteKit (Svelte 5, TS), adapter-vercel, Vitest, Playwright, lint, Makefile (`make dev`, `make test`) | todo |
| 2.2 | `backlog.ts` + `meta.ts`: preamble, sections, notes, items (both id forms, title, ★, job tag, meta with unknown keys kept, body, byte range), and warnings (no meta, duplicate id, bad id). Golden tests on both fixtures. **M** | todo |
| 2.3 | `progress.ts`: plan tables (by the `#` + `Status` header rule), groups from headings, canonical status and note, and `unknown`. Golden tests. **S** | todo |
| 2.4 | `config.ts`: `.projectmagic.yml` with defaults and validation. **S** | todo |
| 2.5 | `branchref.ts` + `link.ts`: branch refs, PR `Backlog:`/`Plan:` lines, item keys and PR titles into edges, plus dangling references. **S** | todo |
| 2.6 | `status.ts`: derived status and its source (§7.2), including plan-task evidence and disagreements, and the branch-copy diff of an item. **S** | todo |
| 2.7 | `history.ts`: done detection from a sequence of `(commit, text)` pairs, including reappearance. **S** | todo |
| 2.8 | `splice.ts`: edit, add, move and remove by id, with the round-trip property test and the next-free-id suggestion. **M** | todo |
| 2.9 | `access.ts`: `can(user, action, project, memberships)` over the §11.2 roles, with a table test of every role against every action. **S** | todo |

### Phase 3: sync and storage (`src/lib/server/`)

| #   | Task | Status |
|-----|------|--------|
| 3.1 | Register the GitHub App (permissions per §11.3) and install it on both repositories. App auth, installation tokens, user OAuth, the bootstrap administrator, signed session cookie, and `can()` on every route with the route-coverage test. **M** | todo |
| 3.2 | Neon database, migrations for §8's schema (users and memberships included), and `db.ts` | todo |
| 3.3 | `sync.ts`: the 0.1 query productionised, a parse cached by `oid`, and the result written per project. History backfill and incremental done detection. **M** | todo |
| 3.4 | The webhook endpoint (verified, deduplicated by delivery, bursts coalesced), revalidation on load after a failure or a quiet day, the daily cron route, the refresh action | todo |

### Phase 4: read-only views

| #   | Task | Status |
|-----|------|--------|
| 4.1 | The overview: project cards with in-flight work, counts, the next plan task and health. **M** | todo |
| 4.2 | Project: List (default) and Board with swimlanes. **M** | todo |
| 4.3 | Item page: body, meta, status source, links, branch-copy diffs | todo |
| 4.4 | Plan, Done and Branches tabs | todo |
| 4.5 | Docs: the tree, rendering with sanitising, id and task autolinks, relative links, branch picker. **M** | todo |
| 4.6 | Search across projects | todo |
| 4.7 | **Deploy v0.1-read** to Vercel and Neon. Point the App's webhook at it. Acceptance: Nick reads both projects' state without asking an agent. | todo |
| 4.8 | Inferred links for older branches (§6, source 6): cited spec filename, then title word overlap. Optional. **S** | todo |

### Phase 5: editing

| #   | Task | Status |
|-----|------|--------|
| 5.1 | The write path (§10.2): the acting user's token, compare-and-swap, retry, `edit_log`, then a sync. `edit_mode: commit`. | todo |
| 5.2 | The edit and add forms (meta as fields, body as markdown), with id uniqueness against main, branches and history | todo |
| 5.3 | Move (drag in List and Board) and remove (done-and-prune or delete), with confirmation | todo |
| 5.4 | The same-item conflict view (three-way choice) | todo |
| 5.5 | `edit_mode: pr` (one open `backlog/edits` branch and PR per project, pending-edit badges, *Merge* for maintainers) and `auto` (fall back on a protected-branch refusal, and remember it). **M** | todo |
| 5.6 | Playwright walk against a throwaway repository. **Deploy v0.1.** | todo |

## Decisions log

- **2026-10-14** Build our own tool, not a fork of MrLesk/Backlog.md. Backlog.md is local-first,
  works on one repository at a time and serves its UI on `127.0.0.1`, and it expects one file per
  task. Project Magic needs to be multi-repository, hosted, GitHub-backed and branch-aware, and to
  keep each repository's single prose `backlog.md`. We borrow Backlog.md's ideas (the status
  model, cross-branch "most advanced wins") but not its code.
- **2026-10-14** Plan task numbers can repeat across tables (orchard restarts at 1 in v2), so
  the later table wins, and earlier rows are history (`spec.md` §5.2).
- **2026-10-14** An item's own meta line beats its linked plan task, because the task often
  records only the phase that was built. Disagreements go to the health panel and are never
  reconciled by the tool (`spec.md` §7.2).
- **2026-10-14** UI designs come from Google Stitch before phase 4, from `design/stitch-prompt.md`.
