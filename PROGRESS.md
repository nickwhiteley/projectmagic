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
| 1.2 | Orchard: migrate `backlog.md` (one id per heading, meta lines, `Branch:` on in-flight items), normalise `PROGRESS.md` status cells, add the `CLAUDE.md` block. One PR on `chore/backlog-conventions`. **M** | **done**: orchard#35 merged 2026-10-14, then #36 (CI and review skip the `projectmagic` branch). 55 items with meta lines and 0 warnings; BP1–BP11 assigned, and `BP` is the prefix for new items; E5 + E6 became E5; task 46's missing row restored. It found two spec rules: plan numbers repeat across tables, and an item's meta must beat its plan task (§5.2, §7.2). |
| 1.3 | Lantern: commit the new `backlog.md` (currently untracked on `feat/sketch-editor`), then the same as 1.2. Give the *Later* headings `FM` ids, move each item's leading `**S–M. In progress.**` into its meta line, and add `.projectmagic.yml` with `new_id_prefix: FM`. **S** | **done**: lantern#70 merged 2026-10-14, then #71. 24 items with meta lines and 0 warnings; FM6–FM9 assigned; `PROGRESS.md` needed no change. |
| 1.4 | Copy the post-migration files from both repositories into `test/fixtures/`, once orchard#35 and lantern#70 merge | **done**: `test/fixtures/`, with sources and commits in its README |

### Phase 2: the pure core (`src/lib/core/`)

| #   | Task | Status |
|-----|------|--------|
| 2.1 | Scaffold: SvelteKit (Svelte 5, TS), adapter-vercel, Vitest, Playwright, lint, Makefile (`make dev`, `make test`) | **done**: `sv` 1.1 (SvelteKit 3, Svelte 5, Vite 8, Vitest 4); ESLint forbids I/O and server imports in `src/lib/core/`; `make test` runs unit tests, `svelte-check` and lint |
| 2.2 | `backlog.ts` + `meta.ts`: preamble, sections, notes, items (both id forms, title, ★, job tag, meta with unknown keys kept, body, byte range), and warnings (no meta, duplicate id, bad id). Golden tests on both fixtures. **M** | **done**: `markdown.ts`, `meta.ts`, `backlog.ts`. Both fixtures parse with 0 warnings (55 and 24 items); golden summaries in `test/golden/`. Also warns on a compound heading (`E5 + E6`) and an unrecognised status. A value may contain ` · ` |
| 2.3 | `progress.ts`: plan tables (by the `#` + `Status` header rule), groups from headings, canonical status and note, and `unknown`. Golden tests. **S** | **done**: `progress.ts`. Later tables supersede earlier rows with the same number; per-group counts; `next` is the first current task in progress or todo, so built tasks don't count. 0 unknown cells in all three fixtures |
| 2.4 | `config.ts`: `.projectmagic.yml` with defaults and validation. **S** | **done**: `config.ts`. A missing file, broken YAML or a bad value falls back to the defaults, key by key, with a warning; unknown keys are warned about. `isProductionEnvironment` matches `*` patterns (§16) |
| 2.5 | `branchref.ts` + `link.ts`: branch refs, PR `Backlog:`/`Plan:` lines, item keys and PR titles into edges, plus dangling references. **S** | **done**: `branchref.ts`, `link.ts`. Sources 1–5; a PR inherits its head branch's ref and `Branch:` links; the most confident source wins per pair; `projectmagic` is never linked. A `Branch:` naming a deleted branch is history, not dangling. On lantern: 15 task-id links, the five sketch items reach `feat/sketch-editor`, 0 dangling |
| 2.6 | `status.ts`: derived status and its source (§7.2), including plan-task evidence and disagreements, and the branch-copy diff of an item. **S** | **done**: `status.ts`. Rule 3 also applies to an item with no meta line (§5.1: todo "unless a branch or PR says otherwise"); §7.2 updated. Orchard's main has three disagreements: NW7 (task 35 done), F9 (task 26 built) and C2 (task 24 built) |
| 2.7 | `history.ts`: done detection from a sequence of `(commit, text)` pairs, including reappearance. **S** | **done**: `history.ts`, incremental from a saved state. A version where the file is missing is skipped. Against orchard's real history (73 versions, about 5.5 s for the one-off backfill): 22 shipped items with commit and date, 55 present |
| 2.8 | `splice.ts`: edit, add, move and remove by id, with the round-trip property test and the next-free-id suggestion. **M** | **done**: `splice.ts`. An edit rewrites only the parts that changed (heading line, meta line, body), so git merges around it. A move reuses one parse and shifts offsets across the cut. Spike 0.2's properties run on a spread of items in both fixtures. Vitest loads micromark's slower `development` build, so the suite takes about 35 s; production builds don't |
| 2.9 | `access.ts`: `can(user, action, project, memberships)` over the §11.2 roles, with a table test of every role against every action. **S** | **done**: `access.ts`, with `visibleProjects` for the overview and search. Disabled and signed-out users can do nothing; a hidden project is seen only by maintainers and administrators (now in §11.2) |

### Phase 3: sync and storage (`src/lib/server/`)

| #   | Task | Status |
|-----|------|--------|
| 3.1 | Register the GitHub App (permissions per §11.3) and install it on both repositories. App auth, installation tokens, user OAuth, the bootstrap administrator, signed session cookie, and `can()` on every route with the route-coverage test. **M** | todo |
| 3.2 | Neon database, migrations for §8's schema (users and memberships included), and `db.ts` | **done**: `migrations/001_initial.sql` applied to Neon (Postgres 18) with `make migrate`; `history_cursor` also keeps the items present, so the walk can continue; `project` has the sync-coalescing columns. The environment is declared and checked at start in `src/env.ts` (SvelteKit 3's `$app/env/private`) |
| 3.3 | `sync.ts`: the 0.1 query productionised, a parse cached by `oid`, and the result written per project. History backfill and incremental done detection. **M** | **done**: all four installed repositories sync (`make sync`): first sync about 35 s, mostly orchard's backfill; later ones 1–3 s each. History walks main's **first-parent** line, which GitHub's API can't filter for, so it is rebuilt from parents: the path-filtered commit list includes merged branches' commits, which made 11 ids that never reached main (NW21–NW31, renamed BP1–BP11 during migration) look shipped. Orchard: 22 done. A ref's PRs are only those whose head is that branch (GitHub also lists PRs into it) |
| 3.4 | The webhook endpoint (verified, deduplicated by delivery, bursts coalesced), revalidation on load after a failure or a quiet day, the daily cron route, the refresh action | **done**: `/api/github/webhook` (signature, dedupe, 202 and a background sync via `waitUntil`; installation events refresh the project list), `/api/cron/sync` daily at 05:00 UTC (`vercel.json`), `POST /p/{repo}/sync`. One sync per project at a time: a request during one makes it run once more (`sync_again`); a claim older than five minutes is presumed dead. Exercised on the dev server; the webhook itself goes live with the first deploy (4.7) |

### Phase 4: read-only views

| #   | Task | Status |
|-----|------|--------|
| 4.1 | The overview: project cards with in-flight work, counts, the next plan task and health. **M** | **done**: per card: last commit, notices, status counts and done in 14 days, *waiting on you* (built and blocked items with their reasons), in-flight branches with their items, PRs and ahead/behind, the current phase's progress and next task. Deploy branches (`main` merged into them by PR, both projects' `vercel`) are recognised and left out |
| 4.2 | Project: List (default) and Board with swimlanes. **M** | **done**: the List interleaves notes and items in file order under their sections, rows expand to the rendered body, filters by status and job, and the health panel lists warnings, disagreements and dangling references. The Board has six columns, lanes by section, and the last 30 days' shipped items |
| 4.3 | Item page: body, meta, status source, links, branch-copy diffs | **done**: diffs only for the branches linked to the item; other branches' differing copies (usually just behind main) are named, not diffed. A shipped item's page shows its last text, commit and PR |
| 4.4 | Plan, Done and Branches tabs | **done** |
| 4.5 | Docs: the tree, rendering with sanitising, id and task autolinks, relative links, branch picker. **M** | **done**: tree per branch head from the `docs` globs, text cached by blob oid in `doc_blob`, contents from h2–h3 |
| 4.6 | Search across projects | **done**: id, then title, then body, across every visible project's main |
| 4.7 | **Deploy v0.1-read** to Vercel and Neon. Point the App's webhook at it. Acceptance: Nick reads both projects' state without asking an agent. | todo |
| 4.8 | Inferred links for older branches (§6, source 6): cited spec filename, then title word overlap. Optional. **S** | **done**: only for branches nothing else links; a spec file named like the branch and cited by exactly one item, else a unique best title overlap (two or more words, most of the branch's). Shown dashed and labelled *inferred*; never used for status. No real branch is matched today, and none wrongly |

### Phase 5: editing

| #   | Task | Status |
|-----|------|--------|
| 5.1 | The write path (§10.2–§10.3): the `projectmagic` branch's four states, the acting user's token, compare-and-swap, retry, `edit_log` and the PR body, then **merge the PR at once (squash) and delete the branch**, falling back to an open PR when the merge is refused. Then a sync. **M** | **done** (against a fake GitHub; not yet against a real repository, see 5.6): `write.ts` takes all four branch states, compare-and-swap with three tries, the same-item check, squash-merge and delete, and a refused merge leaving the PR open; `user-token.ts` refreshes and rotates the user's token; `edits.ts` writes `edit_log`, the PR body and the project's edit state, then syncs. 10 tests on a fake repository with commits, refs, a line-level three-way merge and PRs |
| 5.2 | The edit and add forms (meta as fields, body as markdown), with id uniqueness against main, branches and history | **done**: only what changed is in the edit (`core/edit-form.ts`), so saving an untouched form changes nothing for any of the 79 real items, and a status change is a one-line diff; existing meta keys keep their place; markdown preview; the next free id (BP12 on Orchard) |
| 5.3 | Move (drag in List and Board) and remove (done-and-prune or delete), with confirmation | **done**: drag onto an item to go before it, or onto a section's end zone; a move form on the edit page as well; remove asks which kind and a tick |
| 5.4 | The same-item conflict view (three-way choice) | **done**: what changed on main, what the edit would change, then keep mine (save again), take theirs (reopen) or combine |
| 5.5 | `auto_merge: false` and refused merges: merging main into an open branch before each edit, pending-edit badges and the main-versus-pending view, *Merge* for maintainers, and the "edits not merged" and "needs a merge by hand" states. **M** | **done**: the project banner shows each state from `project.edit_state` (migration 002), with *Merge* for maintainers; pending badges and the main-versus-branch diffs were already in phase 4 |
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
- **2026-10-14** Every edit to a managed repository goes to a branch named `projectmagic`, with
  one open PR, never to main, so repositories can exclude the tool's PRs from their workflows.
  This replaces the per-repository `edit_mode` (`spec.md` §10.2).
- **2026-10-14** The tool merges each edit's PR straight away, so main stays current (`auto_merge`,
  default on). CI and the review skip the `projectmagic` branch, and CI skips pushes to main that
  change only `backlog.md` (`spec.md` §10.2, §10.4).
