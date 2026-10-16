# Project Magic: specification

**Draft 2, 2026-10-14.** This is authoritative. The first draft's questions are settled in §14.

## 1. What it is

**A web dashboard over projects whose backlogs are kept by AI agents in markdown in GitHub.**
It answers "what is happening on each project?" without asking an agent in each repository. It
does this by reading the files the agents already maintain, on `main` and on every active
branch, across several repositories.

It is a **view and a light editor, never the system of record.** The master copy of every
backlog, plan and document stays in its own repository. Project Magic holds only a cache that
it can rebuild from GitHub at any time. If Project Magic disappears, nothing is lost and the
agents notice nothing.

Three things it shows for each project:

1. **The backlog**: items in `backlog.md`, in their written order, grouped by the file's own
   sections, each with a status.
2. **The plan**: the ordered tasks in `PROGRESS.md`, with their status and notes.
3. **The documentation**: `README.md`, `spec.md`, `specs/`, `docs/` and the rest, rendered and
   cross-linked.

It also shows **what is in flight**: active branches and open pull requests, linked to the items
and tasks they work on. And it shows **what is done**: items removed from `backlog.md` when they
shipped, recovered from git history.

One thing it does: **edit the backlog.** You can add, change, move and remove items. Each
edit is a commit to the repository, the same as an agent's.

### Who it is for

**One user (Nick) in v0.1, designed for many.** Users, project memberships and roles exist in
the data model from the start, and every route asks one permission function (§11). For v0.1
there is one user, who is a system administrator. Adding a second user, or real role-based
access, means adding rows and screens, not reworking the code.

### What it is not

- **Not a replacement for the agents' files.** It adds no store of items that the agents
  can't see.
- **Not an agent runner.** It doesn't start, steer or talk to agents. They keep working in their
  repositories, and Project Magic reads what they write.
- **Not Jira.** It has no workflow engine, permissions model, sprints or time tracking. Status
  is whatever the files and branches say.

## 2. Principles

- **The repository is the database.** Every fact shown is derived from a file, a branch, a
  commit or a pull request. The cache is keyed by content hash and can be discarded.
- **The prose stays prose.** The backlogs carry their reasoning: the ordering argument, the
  cut line, the open and decided questions. The conventions in §5 add one machine-readable
  line per item and change nothing else. A human or an agent reading `backlog.md` on GitHub
  should barely notice them.
- **Edits are surgical.** An edit replaces the exact range of one item's section and leaves
  every other byte of the file untouched (spike 0.2). The file is never re-serialised from a parsed
  model.
- **Functional core, imperative shell.** Parsing, linking, status derivation, done detection
  and splicing are pure functions over strings and plain data, tested without a network. The
  GitHub client, the database and the web routes are a thin shell around them.
- **Forward compatible.** The parser keeps every metadata key it doesn't know, so epics,
  bugs and whatever comes next can be added to the files before the tool understands them.

## 3. Topology

```
browser ──> SvelteKit on Vercel ──> Neon Postgres (cache)
                 │   ▲
                 │   └── GitHub webhooks (push, pull_request, create, delete): primary freshness
                 └──────> GitHub GraphQL + REST (as a GitHub App)
```

- **SvelteKit** (Svelte 5, TypeScript) with `adapter-vercel`. This is the same stack as
  Orchard's web tier. Server routes do everything, and there is no separate API service.
- **Neon Postgres** through the Vercel integration, for the cache, the project registry and
  the edit log.
- **A GitHub App** installed on the selected repositories. It gives:
  - installation tokens for reading, at higher rate limits than a personal token;
  - webhooks for keeping the cache fresh;
  - user-to-server tokens, so an edit is committed **as Nick**, not as a bot.
- **Webhooks keep it fresh** (§7.4). A daily Vercel Cron run is a backstop for missed
  deliveries, which is the most the Hobby plan allows and is enough.

## 4. Projects and configuration

**A project is one GitHub repository.** The list of projects is the set of repositories the
GitHub App is installed on, minus any a maintainer hides in the UI.

**Each repository describes itself in `.projectmagic.yml`** at its root, on `main`. The file is
optional, and every key has a default:

```yaml
name: Orchard                 # default: the repository name
backlog: backlog.md              # default: backlog.md, then BACKLOG.md
progress: PROGRESS.md            # default: PROGRESS.md; null to disable
epics: epics.md                  # default: epics.md; descriptions and targets for epics (§13)
bugs: bugs.md                    # default: bugs.md; a second backlog for bugs, null to not read one (§13)
bug_prefix: BUG                  # the prefix suggested for a new bug
docs:                            # default: shown below
  - README.md
  - spec.md
  - strategy.md
  - specs/**/*.md
  - docs/**/*.md
docs_exclude:
  - specs/archive/**
main: main                       # default: the repository's default branch
active_branch_days: 30           # a branch with no commit for this long is stale
new_id_prefix: BP                # the prefix suggested for a new item (§10.1)
auto_merge: true                 # merge each edit's PR straight away (§10.2)
inference: true                  # false opts out of model-inferred statuses (§13)
production_environments:         # default: GitHub deployment environments named Production*
  - "Production – orchard-web"   # (§16.6)
```

The file lives in the repository, where it is versioned and the agents can see it. The tool
stores only access settings per project: whether it is hidden, and who its members are (§11).
Access is about people, not the repository, so it doesn't belong in the repository.

## 5. The conventions

**This section is the contract between the agents and the tool.** `specs/conventions.md`
restates it in a form that can be pasted into each repository's `CLAUDE.md`. If the two
disagree, this section wins.

### 5.1 Backlog items

An **item** is a `###` heading whose first token is an **item id**:

```markdown
### NW9 DXF export — PRO
**Status:** in progress · **Size:** M · **Job:** PRO · **Branch:** `feat/nw9-dxf-export`

The prose, exactly as today …
```

- **The id** takes one of two forms. Both are unique within the repository and **never reused**,
  because specs, commits and conversations cite them:
  - **a letter id**, matching `[A-Z]{1,4}[0-9]+[a-z]?` (for example `C1`, `A1a`, `NW12`,
    `FM3`);
  - **a plan task number**, matching `[0-9]+(\.[0-9]+)*[a-z]?` (for example `5.8`, `2.6`, `3.6b`).
    This is Lantern's practice: its backlog keeps the reasoning for `PROGRESS.md` tasks
    that aren't done, under the task's own number. **An item with a task number is linked to
    that task automatically**, and the item and task are shown as one thing with two views.

  A heading carries one id. Today's `E5 + E6 residual` becomes `E5` (with E6 mentioned in the
  prose) or two items.
- **The title** is the rest of the heading. A trailing ` — WORD` is read as the job tag, and a
  leading `★` marks an item on the cut line. Both are existing Orchard idioms, kept as they
  are.
- **The meta line** is the first non-blank line after the heading, and it **begins with
  `**Status:**`**. It is a run of `**Key:** value` pairs separated by ` · `. Keys are
  case-insensitive. A paragraph that opens with any other bold key, such as `**Specced:**`,
  `**Open:**` or `**Decided:**`, is prose (spike 0.2). Known keys:

  | Key        | Values                                                         | v0.1 use            |
  | ---------- | -------------------------------------------------------------- | ------------------- |
  | `Status`   | `todo` · `in progress` · `blocked` · `in review` · `built` · `done` | the card's column |
  | `Size`     | `S` · `M` · `L` · ranges like `S–M`                            | shown               |
  | `Job`      | free text; overrides the heading tag                          | shown, filterable   |
  | `Branch`   | a branch name, in backticks                                    | links (§6)          |
  | `Plan`     | `PROGRESS.md` task numbers, comma-separated                    | links (§6)          |
  | `Waiting`  | free text: who or what it waits on                             | shown with blocked  |
  | `Type`     | `feature` (default) · `bug`                                    | kept; v0.2 (§13)    |
  | `Found`    | for a bug: `production` · `preview` · `development`            | kept; §16.4         |
  | `Raised`   | for a bug: when it was first noticed                           | kept; §16.4         |
  | `Epic`     | an epic id                                                     | kept; v0.2 (§13)    |
  | `For`      | who it is for: `person…` or `agent…`, below                    | shown, filterable   |

  **`For:` is a dotted path** whose first part is `person` or `agent` (PM16): `person` is any
  person, `person.nickwhiteley` one GitHub login, `agent` any agent, `agent.claude` any Anthropic
  agent, `agent.claude.opus` one model family. Agents name themselves `agent.<maker>.<family>`,
  with no version, since a version's dots would read as levels. An item has one `For:`, and none
  means anyone's. A value that starts with anything else is kept, shown, and listed in the health
  panel. **A path covers everything below it, and is covered by everything above it**: a filter
  shows items for its path or below, items for a path above it, and unassigned items, so
  `person.nickwhiteley` shows items for `person.nickwhiteley`, for `person` and for no one, and
  `agent.claude.opus` doesn't show items for `agent.claude.sonnet`.

  Unknown keys are kept and shown as-is. **A missing meta line is not an error.** The item is
  `todo` unless a branch or PR says otherwise, and the item is flagged "no meta" so the user
  can see which items the agents haven't annotated.
- **The body** runs to its last content block before the next heading of level 3 or above. A
  trailing `---` and blank lines belong to the gap between items, not to the item.
- **`built`** means merged but waiting on a human acceptance check, such as opening the DXF
  output in AutoCAD or the lawyer's read. Orchard writes it `built*`, which is accepted.
- **Headings without an id are notes**, for example `### Start here, 1 October 2026`. They are
  shown as prose in place and are not items. The health panel lists them for information,
  because some are really items that were never given an id (Lantern's *Later*
  section is an example).
- **`##` headings are sections** (`Now — days`, `To late October`, …). They are ordered and
  become the backlog's swimlanes. Text before the first `##` is the **preamble**.

**Order is meaning.** An item's position in the file is its priority. The tool shows document
order by default and never re-sorts silently.

**Shipped items are still removed**, as Orchard does today. Done is detected from history
(§7.3). An agent may set `Status: done` before pruning, but it doesn't need to.

### 5.2 Plan tasks (`PROGRESS.md`)

**A plan table is any GFM table whose first column header is `#` and that has a column headed
`Status`.** Each row is a task. Its number is the `#` cell (`23`, `3.7`, `6a`). Its group is the
nearest heading above the table (`Phase 3: engine depth`, `v2: the spec set`). Every other
column is kept and shown.

**When a number appears in more than one plan table, the later table wins.** Earlier rows with
that number are shown as history and are never linked. Orchard restarts at 1 in its v2 table,
so its `9` is "Catalogue sorting and filtering", not the prototype's "Auth and catalogue
endpoints" (found in migration, task 1.2).

**The status cell starts with a canonical word**, optionally in bold: `done`, `todo`,
`in progress`, `blocked`, `built` (or `built*`), `skipped`. Whatever follows (`**done**: passed on 18.6 …`) is the
note. Both repositories already almost follow this, and the tool shows a cell that starts any
other way as `unknown`.

The narrative sections of `PROGRESS.md`, such as the decisions log and the reviews, are
rendered as a document, not parsed.

### 5.3 Branches and pull requests

**Branch names are `<type>/<ref>-<slug>`.** `type` is one of `feat`, `fix`, `spike`, `spec`,
`chore` or `docs`. `ref` is an item id in lower case (`nw9`) or a plan task number (`5.7`):

```
feat/nw9-dxf-export
fix/a3-gate-off-by-one
spike/0.6-ollama-latency
feat/5.7-sketch-part-editor
```

`ref` is optional (`chore/plinth-v0.4.0`), but a branch without one only links through the
item's `Branch` key or a PR body.

**A pull request body names what it works on** with a line `Backlog: NW9` and/or
`Plan: 5.7`. Several ids are separated by commas. **A PR that fixes a bug says where the bug
was found**, `Bug: production`, `Bug: preview` or `Bug: development`, and, for production,
`Raised: <date and time>` when it was first noticed, if known (§16.4).

Existing branches keep their names. They link through `Branch:` on the item, or not at all.

### 5.4 What the agents are asked to do

The `CLAUDE.md` addition, kept short so agents actually follow it:

1. Give every backlog item an id and a meta line. When you start an item, set
   `Status: in progress` and `Branch:` on your branch's copy of `backlog.md`.
2. Name branches `<type>/<ref>-<slug>`.
3. Put `Backlog:` / `Plan:` lines in every PR body.
4. Begin every plan status cell with a canonical word.
5. Never reuse an id. Keep removing shipped items as you do now.

## 6. Linking

**Links are derived, never stored in the files beyond §5.** For each project, the linker takes
items, tasks, branches and PRs and produces edges `item ↔ branch`, `item ↔ PR`,
`item ↔ task`, `task ↔ branch` and `task ↔ PR`. It uses these sources, in order of confidence:

1. an item whose id is a plan task number, which links to that task (§5.1);
2. a branch's `ref` (§5.3);
3. a PR body's `Backlog:` / `Plan:` lines;
4. an item's `Branch:` and `Plan:` keys, read from **every** copy of the item (main and each
   branch);
5. an id at the start of a PR title (`NW9: DXF export`);
6. **inferred links for older branches**, a best-effort fallback:
   - a branch whose slug matches a spec file that an item's body cites (Orchard's
     `dxf-export` branch matches NW9's "Specced: `specs/dxf-export.md`");
   - failing that, a strong word overlap between the slug and exactly one item's title.

   Inferred links are drawn dashed, labelled *inferred*, and never move an item to *in review*.
   Any link from sources 1–5 replaces them.

**The `projectmagic` branch is excluded from linking** (§10.3): it holds pending edits, not
work.

A link to an id that doesn't exist is reported as a **dangling reference** on the project's
health panel. It is not dropped silently.

## 7. Sync

### 7.1 What is fetched

**Only branches pushed to GitHub exist for the tool** (spike 0.1). For each project, one GraphQL
query (paginated past 100 refs) fetches:

- every branch: name, head commit, commit date, `aheadBy` and `behindBy` against main, and
  associated PRs (number, title, body, state, draft, URL);
- on every branch: the blob `oid` of `backlog.md`, `PROGRESS.md` and `.projectmagic.yml`
  (`file(path:)` on the head commit), with text fetched only for **active** branches. A branch
  is active if it is main, has an open PR, or is ahead of main and was committed to within
  `active_branch_days`.

Docs are fetched lazily on first view, by tree listing on main and blob by `oid`, then cached by
`oid`.

The first query fetches only blob **oids** for each branch. A second query fetches text, by
`object(oid:)`, only for oids not already parsed. **Parsing is keyed by blob `oid`**, so sixty
branches carrying an unchanged `backlog.md` mean one fetch and one parse. Spike 0.1 measured two
calls and 2 rate-limit points per repository, and a webhook sync is usually one call
(`spikes/0.1-graphql/RESULT.md`).

### 7.2 Status derivation

An item's **displayed status** is decided by the first rule that applies:

| # | Evidence                                                                   | Status      |
| - | -------------------------------------------------------------------------- | ----------- |
| 1 | removed from main's `backlog.md` (§7.3), or `done` in main's meta line     | done        |
| 2 | a linked **open** PR                                                       | in review   |
| 3 | main's meta says `todo` or `blocked`, or there is no meta line, and there is a linked active branch or `in progress` on a branch's copy | in progress |
| 4 | main's meta line                                                           | its status  |
| 5 | no meta line: the linked plan task's status, or the least advanced of several | that status |
| 6 | otherwise                                                                  | todo        |

**The item's own meta line beats its plan task.** A plan task often records the phase that was
built, while the item carries what is left. Orchard's F9 links task 26, which built phases
1–5 (`built*`), while the item is phase 6, a run by hand that is `in progress`. An earlier draft
of this rule took the most advanced evidence, and would have shown F9 as built (found in
migration, task 1.2).

**Disagreements are shown, never resolved.** When the meta line and a linked plan task differ,
the health panel lists it, for example "NW7: backlog says built, plan task 35 says done". The
tool never edits either file to reconcile them. `blocked` against `todo` is not a disagreement,
because `blocked` is a `todo` with a reason.

`blocked` is also a **flag** shown on in-progress and in-review cards, with `Waiting:` text, so
a blocked item with a branch reads as both.

**Each card shows where its status came from**: "in progress: `feat/nw9-dxf-export`,
3 ahead, last commit 2 h ago". When a branch's copy of an item differs from main's, the item
view shows both, as a diff.

### 7.3 Done detection

**Shipped items are deleted, so "done" comes from history.** The tool walks the commits on main
that touched `backlog.md` (`GET /commits?path=…`) and fetches the file at each one in batched
GraphQL. It diffs the id sets of consecutive versions. An id present before and absent after
is **done at that commit**, and the tool records its last body, the commit, its date, and the PR
that merged it. An id that reappears later is no longer done.

**An item deleted with Project Magic's Remove is deleted, not done.** Its removal looks the
same in the history, so `edit_log` tells it apart: when the last edit Project Magic made to the
id was a `remove` that landed with the removal (before it reached main or within ten minutes
after, and from the same PR where both are known), the item is *deleted*. Deleted items are left
off the Done list's shipped items, the Board's shipped column and the overview's counts, and are
listed, collapsed, at the bottom of the Done tab. Their pages say *deleted*, and their ids are
never reused. A removal made outside Project Magic still counts as shipped (PM24).

The first sync backfills the whole history once. Later syncs only look at new commits.
Results are immutable per commit, so they are cached forever.

`PROGRESS.md` tasks are done when their status cell says so. An item whose `Plan:` tasks are
all done but which is still on main is shown with a hint: "all plan tasks done; still in
backlog".

### 7.4 Freshness

- **Webhooks are the primary mechanism.** `push`, `pull_request`, `create` and `delete` mark a
  project stale and start a sync. The signature is verified, and the payload is only a trigger
  and is never trusted as data. Deliveries are deduplicated by `X-GitHub-Delivery`. A burst of
  pushes collapses into one sync, because a sync already running for the project is told to
  run once more when it finishes.
- **On page load**, a project whose last sync failed, or that has had no webhook for a day, is
  re-synced in the background (stale-while-revalidate). The page always shows its sync time.
- **A daily Vercel Cron run** re-syncs everything, in case a delivery was missed.
- **A refresh button** forces a sync.

A sync is a few GraphQL calls and a few parses, so it fits comfortably in a function invocation.

## 8. Data model (the cache)

```
app_user       (id, github_id, github_login, name, system_role admin|member, disabled_at,
                refresh_token_enc, created_at)
membership     (user_id, project_id, role viewer|editor|maintainer, granted_by, granted_at)
project        (id, owner, repo, installation_id, hidden, config_json, last_sync_at, last_error)
ref            (project_id, name, head_oid, committed_at, ahead, behind, active, pr_json)
blob_parse     (oid primary key, kind backlog|progress|config, parsed_json, parser_version)
ref_file       (project_id, ref_name, path, oid)
done_item      (project_id, item_id, title, last_body, removed_oid, removed_at, pr_number)
history_cursor (project_id, last_commit_oid)
doc_blob       (oid primary key, text)
edit_log       (id, project_id, user_id, item_id, op, base_oid, commit_oid, pr_number, at, error)
webhook_delivery (delivery_id primary key, project_id, event, received_at)
```

Bumping `parser_version` invalidates every `blob_parse`. **Two kinds of table are kept:**
`app_user`, `membership`, `project.hidden` and `edit_log` are real data and are backed up.
Everything else is cache, and can be truncated and rebuilt.

## 9. The views

**The overview (`/`)** is one card per project, which is the point of the tool. Each card
shows:

- the project's name and its last commit on any branch, with its age;
- counts of in progress, in review, built, blocked and todo in the current first section, and done in
  the last 14 days;
- the in-flight list: each active branch with its linked item, ahead and behind counts, PR
  state and last commit message;
- the plan's progress (done over total for the current group) and its **next task**: the first
  task in document order that is in progress or todo (a built task waits on a person, not an
  agent);
- health: items with no meta, dangling references, unparseable status cells and sync errors.

**A project (`/p/{repo}`)** has tabs:

- **Board**: columns todo · in progress · blocked · in review · built · done (the done column
  covers the last 30 days), with swimlanes from the backlog's `##` sections. Cards show id, title, ★, size,
  job, `For:` and the status source. A *For* filter (§5.1) shows *mine* (the signed-in person),
  *people*, *agents* or any value in use; dragging is off while it is set.
- **List**: the backlog in document order, as written, including the preamble and notes. This
  is the default, because order is priority. It filters by status, job and *For*, each mirrored
  in the URL so a filtered list can be shared.
- **Plan**: `PROGRESS.md`'s tables, grouped, with status chips, and the narrative below.
- **Done**: shipped items, newest first, with commit, PR and date.
- **Branches**: every branch, active or stale, with its links. Unlinked active branches are
  listed first, because they are work the backlog doesn't know about.
- **Docs**: a tree of the configured files, rendered (GFM tables, code, Mermaid in a later
  version), on main by default with a branch picker. Item ids and `PROGRESS.md` task numbers in
  any document become links. Relative links between documents work.

**An item (`/p/{repo}/i/{id}`)** shows the rendered body, the meta, the status and its source,
the linked branches, PRs and tasks, a diff for each branch copy that differs from main's, and an
edit button.

**Search** covers ids, titles and bodies across every project, on main.

## 10. Editing

### 10.1 Operations (v0.1)

- **Edit an item**: title, meta (as fields) and body (as markdown).
- **Add an item**: in a chosen section, at a chosen position. Its id is suggested from
  `new_id_prefix` (or, without one, the most common letter prefix) and the highest number in use,
  and can be changed. A plan task number can be entered as the id, to add the reasoning for an
  existing `PROGRESS.md` task. Uniqueness is checked
  against main, every active branch **and** done history, so a shipped id is never reused.
- **Move an item**: before or after another item, within its section or into another. This is
  a cut and an insert of its exact range. Both `before` and `after` are needed, because only
  `after` can place an item last in a section. When the item is last in the file, the cut takes
  the blank line before it (spike 0.2).
- **Remove an item**: by marking it `done` and pruning it, or by deleting it outright. Both ask
  for confirmation.

The backlog is the only file v0.1 edits. Plan status cells and documents are edited too (§13, PM6),
in the same way: a commit on the `projectmagic` branch, merged at once.

### 10.2 Every edit goes to the `projectmagic` branch

**Project Magic never commits to main.** Every edit is a commit on a branch named exactly
`projectmagic` in the managed repository, and reaches main through a PR from it, *Project Magic
edits*. The fixed name lets a repository exclude the tool's PRs from its workflows (§10.4).

**The PR is merged straight away** (`auto_merge: true`, the default), so main, which agents
branch from and the views read, is never behind the owner's edits. After the commit, the tool
merges the PR itself with the acting user's token (`PUT /pulls/{n}/merge`, squash, titled with
the edit's commit message) and deletes the branch. Each edit therefore becomes one commit on main,
such as `Backlog: edit NW9 DXF export (#41)`. It doesn't use GitHub's own auto-merge, which only
waits for required checks, and neither managed repository has any. It needs nothing from GitHub
Actions either.

**If the merge is refused** (a branch protection rule added later, a required review, or a race
with an agent's merge that conflicts), the PR stays open, its edits show as pending (§10.3), and
the project shows why. The next edit goes onto the same open PR.

With `auto_merge: false`, edits accumulate on the open PR until someone merges it, for a
repository whose owner wants to batch and read them first.

The branch's state decides what an edit does first:

| The `projectmagic` branch                                   | Before the edit                              |
| ----------------------------------------------------------- | -------------------------------------------- |
| doesn't exist                                               | create it from main's head, and open the PR  |
| has an open PR                                              | use it                                       |
| has no open PR, and every commit on it is in main           | move it to main's head (nothing is lost), and open a new PR. This happens when someone merged it on GitHub without deleting it |
| has no open PR, and commits that aren't in main             | **stop.** The project shows "edits not merged", with the commits, and a maintainer chooses to reopen a PR for them or discard them, with confirmation |

**While a PR is open (with `auto_merge: false`, or after a refused merge), main moves**, because
agents merge their branches. Before each edit, if
the branch is behind main, the tool merges main into it (`POST /repos/{owner}/{repo}/merges`) so
the edit is made against the current backlog and the PR stays mergeable. If that merge
conflicts, the project shows "edits need a merge by hand" with a link to the PR, and no further
edit is accepted until it is resolved.

### 10.3 The write path

1. Bring the `projectmagic` branch up to date (§10.2). Read its `backlog.md` and blob `oid`.
2. Locate the item by id in **that** text, not in the cache, and splice its range
   (`splice(text, op) → text`, a pure function).
3. Commit it to `projectmagic` with the contents API, passing the blob `sha` as
   compare-and-swap, using the **acting user's** token, so the commit is attributed to whoever
   made the edit. The commit message is `Backlog: <op> <ID> <title>`, for example
   `Backlog: edit NW9 DXF export`.
4. On a 409, which means the file changed underneath, go back to step 1 and retry up to three
   times. Splices are by id, so a concurrent change to a different item is harmless. A
   concurrent change to **the same** item is shown to the user as a three-way choice and is
   never overwritten silently.
5. Write `edit_log` and update the PR's body with the list of edits it holds.
6. With `auto_merge`, merge the PR and delete the branch. Then sync until the cache holds the
   merge commit (or, while the PR is pending, the branch's commit), for up to ten seconds: a
   sync a webhook started may still be running, and GitHub can return a ref's old head for a
   moment after it moves. The page the edit returns to then shows it. An item added in the last
   minute that the cache still lacks shows as *being added*, never as a 404.

**Pending edits are visible.** While a PR is open, each affected item carries a *pending* badge,
and its page shows main's version beside the pending one. Views read main, so the board doesn't
change until the edit is merged. **Merging** happens on GitHub, or with a *Merge* button for a
project `maintainer` whose GitHub account may merge.

**The `projectmagic` branch is never work.** It is excluded from linking (§6) and status
derivation (§7.2), so a pending edit never makes an item look in progress.

**Agents' branches carry stale copies of `backlog.md`.** When an agent's branch merges, git's
three-way merge combines the user's edit with the agent's own change unless both touched the
same lines. That is the same risk two agents already run today, and the PR shows it.

### 10.4 Excluding the tool's PRs from workflows

A managed repository opts its workflows out by branch name. For a PR-triggered job, such as
the automated review in `pr-review.yml`:

```yaml
jobs:
  review:
    if: github.head_ref != 'projectmagic'
```

A job skipped by `if` reports success, so it doesn't block a required check. **CI does the same
on every job**, because a `pull_request` trigger filters on the base branch and can't filter on
the head. A merged edit changes only `backlog.md`, so the push to main is skipped with
`paths-ignore: [backlog.md]`. Both managed repositories carry these rules (orchard#36,
lantern#71).

**Vercel deploys every branch and every push to main**, so an edit causes a preview deploy of
`projectmagic` and, once merged, a production deploy that changes nothing. A managed repository's
`vercel.json` skips both: `deploymentEnabled` turns off the branch, and `ignoreCommand` is an
Ignored Build Step that exits 0, skipping the build, when a commit touches nothing but
`backlog.md`:

```json
{
	"git": { "deploymentEnabled": { "projectmagic": false } },
	"ignoreCommand": "git diff --quiet HEAD^ HEAD -- ':(top)' ':(top,exclude)backlog.md'"
}
```

A squash merge is one commit on main, so `HEAD^` is main before the edit. An agent's commit that
only changes `backlog.md` is skipped too. If the command fails, say because the clone has no
parent commit, it exits non-zero and Vercel builds. Project Magic's own `vercel.json` carries both.

Until that is set, §16 doesn't count deploys whose commit is a Project Magic edit.

## 11. Auth and security

### 11.1 Identity

- **Sign in with the GitHub App's user OAuth flow.** Only GitHub accounts with an `app_user` row
  can sign in. The first one comes from `BOOTSTRAP_ADMIN_GITHUB_LOGIN`, which creates that user as
  a system administrator on first sign-in and is ignored once any administrator exists. Later
  users are invited by an administrator, which creates their row. The session is an HTTP-only,
  signed cookie that carries the user id and is checked against `disabled_at` on each request.
- The user's refresh token is stored **encrypted** (`TOKEN_ENCRYPTION_KEY`) and used only for
  that user's writes. Reads use installation tokens.

### 11.2 Roles and permissions

**Built in v0.1, used by one person.** Roles are ordered, and each includes the one before it:

| Project role | Can                                                                 |
| ------------ | ------------------------------------------------------------------- |
| `viewer`     | see the project: overview card, backlog, plan, branches, docs      |
| `editor`     | edit the backlog (§10)                                              |
| `maintainer` | merge the edit PR, hide the project, manage the project's members  |

A **system administrator** sees and maintains every project, invites and disables users, and
installs the GitHub App. A system role and a project role are separate, and neither implies the
other, except that an administrator is treated as `maintainer` everywhere.

- **One pure function decides:** `can(user, action, project, memberships) → boolean`. Every
  route and every server action calls it, and none checks roles inline. A test lists every
  route and asserts which action it checks.
- **A project the user can't see is a 404**, not a 403, and is absent from the overview and
  from search.
- **A hidden project** is seen only by its maintainers and administrators, so one of them can
  unhide it.
- **GitHub has the last word on writes.** Edits use the user's own token, so a project
  `editor` without push access to the repository gets GitHub's refusal, shown as "your GitHub
  account can't write to this repository". Project Magic never uses the App's token to write on
  a user's behalf, so it can't grant someone more than GitHub does.
- **v0.1 has no membership screens.** The single administrator sees everything. The tables,
  `can()` and its tests exist. Invitations and the member list come with PM7.

### 11.3 GitHub and transport
- **App permissions**: contents read and write, pull requests read and write, metadata read,
  and, for PM9's delivery measures (§16), deployments read and actions read, granted up front so
  PM9 needs no new approval. Nothing else.
- Webhooks are verified against `GITHUB_WEBHOOK_SECRET`.
- Rendered markdown is sanitised. The documents come from repositories you own, but a branch
  can contain anything an agent wrote.

**Registering the App** (GitHub → Settings → Developer settings → GitHub Apps → New):

| Setting | Value |
| ------- | ----- |
| Name | `Project Magic (nickwhiteley)`: App names are unique across GitHub |
| Homepage URL | `https://github.com/nickwhiteley/projectmagic` (required, unused) |
| Callback URLs | `http://localhost:5173/auth/github/callback`, and `https://www.projectmagic.work/auth/github/callback` once deployed |
| Expire user authorization tokens | on: sign-in returns a refresh token, stored encrypted (§11.1) |
| Request user authorization during installation | off: users sign in separately |
| Device flow | off |
| Setup URL | none |
| Webhook | `https://www.projectmagic.work/api/github/webhook`, with the secret; inactive until the first deploy (4.7), since GitHub needs a public URL. Until then, syncs come from page loads, the refresh button and the cron (§7.4) |
| SSL verification | on |
| Repository permissions | as above; account permissions none |
| Events | push, pull request, create, delete (§7.4) |
| Installable by | only this account |

After creating it: note the App ID and client ID, generate a client secret and a private key,
and install it on the chosen repositories (*Only select repositories*).

**Environment** (`.env.example` lists it):

| Variable | What |
| -------- | ---- |
| `DATABASE_URL` | Neon Postgres, pooled |
| `GITHUB_APP_ID` | the App's id |
| `GITHUB_APP_PRIVATE_KEY` | the `.pem`'s contents; on Vercel |
| `GITHUB_APP_PRIVATE_KEY_PATH` | or a path to the `.pem`; for local development |
| `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` | the App's user OAuth credentials |
| `GITHUB_WEBHOOK_SECRET` | the webhook's secret (`openssl rand -hex 32`) |
| `SESSION_SECRET` | signs the session cookie (`openssl rand -hex 32`) |
| `TOKEN_ENCRYPTION_KEY` | encrypts refresh tokens: 32 bytes, base64 (`openssl rand -base64 32`) |
| `BOOTSTRAP_ADMIN_GITHUB_LOGIN` | the first administrator's GitHub login (§11.1) |
| `CRON_SECRET` | set by Vercel; the daily cron route checks it |

## 12. Code layout and testing

```
src/lib/core/        pure: backlog.ts, progress.ts, meta.ts, branchref.ts, link.ts,
                     status.ts, history.ts, splice.ts, config.ts, access.ts (can())
                     (no I/O, no imports from shell)
src/lib/server/      shell: github.ts (GraphQL, REST, App auth), sync.ts, db.ts, auth.ts
src/routes/          pages and the webhook, cron and edit endpoints
test/fixtures/       real snapshots of both repositories' files, committed
```

- **Markdown is parsed with `unified`/`remark` + `remark-gfm`** for position-accurate headings
  and tables. Rendering uses the same pipeline plus `rehype-sanitize`.
- **Golden tests against realistic files**: two made-up projects' `backlog.md` and `PROGRESS.md`,
  written to the cases real ones produce, are committed under `test/fixtures/`, and their parse
  is pinned in `test/golden/`.
- **The splice round trip is a property test**: for every item in a fixture, a no-op edit
  returns the file byte for byte, and an edit changes only that item's range.
- Vitest for the core, and Playwright for one walk (sign in with a test login, the overview, an
  item, an edit against a throwaway repository).

## 13. Later (not v0.1)

These are recorded so v0.1 doesn't paint them into a corner. Each one is also an item in this
repository's `backlog.md`.

- **Epics** (built, PM1). An epic is declared as a `##` or `###` heading with an id prefixed
  `EP` in `backlog.md`. Items join one with `Epic: EP3`. The *Epics* tab rolls each epic up
  across its items' statuses, counting items that shipped (read from the item as it was removed),
  and the List and Board filter by it. A value that isn't `EP` and a number is flagged in the
  health panel. An optional `epics.md` (the `epics` key) declares epics too, each as a `###` or `##` heading
  `EP3 Title` with its description underneath and a `**Target:** …` line; the Epics tab shows both.
  The add and edit forms have an *Epic* field that suggests the declared epics (PM28).
- **Bugs** (built, PM2 and PM29). `Type: bug` with `Found:` and `Raised:`, and a Type filter.
  Bugs can also live in their own `bugs.md` (the `bugs` key), a second backlog in the same format
  with a `BUG` prefix (`BUG12`, the `bug_prefix` key), because Orchard already uses `B1`–`B14`. The
  views read the two files as one list: the bugs follow the main items, in a *Bugs* section that is
  also the Board's bug lane, and an item with no `Type` in that file counts as a bug. An edit goes
  back to the file the item is in, and a move stays inside its file. Done detection reads the two
  files together, so a bug removed from `bugs.md` shipped. An id in both files is shown once and
  flagged in the health panel.
- **LLM fallback for status** (built, PM3): for items with no meta line, a model reads the prose
  ("Built 2026-09-30 … waits only on the lawyer") and proposes a status and waiting reason,
  shown as *inferred* and never used to derive the real status (§7.2). The model is chosen by
  environment (Ollama first; OpenAI and Anthropic too). A project may use a daily token limit
  (default 50 000), counted by scope so it can move to tenants (PM20). A project opts out with
  `inference: false`, and a person hides the proposals from their own views. A proposal is cached
  against the item's text and dropped when the item changes.
- **Ask across projects** (built, PM4): a question box answered from the cached parses, such as
  "what is blocked on the lawyer?". A model reads a digest of every visible project's items
  (status, waiting reason, who it is for, branches, PRs, and what shipped in 30 days), within the
  same daily token limit counted per person. An answer's citations become links only to items in
  the digest. Projects with `inference: false` are never sent, and a person who hid AI features
  can't ask.
- **Activity feed**: recent commits across all projects, grouped by linked item.
- **Delivery and quality** (§16): deployment frequency, lead time, change failure rate, time to
  restore, throughput, and the founder queue.
- **Editing `PROGRESS.md` status cells and docs** (built, PM6). The Plan page has an *Edit* on each
  task: a status and a note, which rewrites only that status cell (a bold word stays bold, the
  note stays unless changed, and a number repeated across tables edits the current row). A
  document on main has an *Edit* that opens its text in a box and saves it whole. Both are
  commits through the §10.2 path, as the person, and a change on main to that task's cell, or to
  that document, since it was opened is a conflict, never an overwrite. Documents are limited to
  the project's `docs` globs and 1 MB.
- **More users**: invitations, the member list and role management, on top of the §11.2
  model that v0.1 already enforces.

## 14. Decisions on the first draft's questions (Nick, 2026-10-14)

1. **Every edit goes to a branch named `projectmagic`**, never to main, so a repository can
   exclude the tool's PRs from its GitHub Actions (§10.2, §10.4). This supersedes the first
   answer, a per-repository `edit_mode`, because main may be protected and a fixed branch name
   handles that case too (Nick, 2026-10-14).
2. **Lantern's backlog** uses `FM` ids for added items and `PROGRESS.md` task numbers
   for items that hold a task's reasoning. Both id forms are accepted (§5.1).
3. **Webhooks are the primary freshness mechanism** (§7.4). Daily cron is only a backstop.
4. **Legacy branches are linked where possible, but this isn't essential.** Inferred links
   (§6, source 6) are a best-effort fallback, built after the read-only deploy.
5. **Designed for multiple users with role-based access, used by one person** (§11.2).

## 15. Open questions

None that block phase 0.

## 16. Delivery and quality (after v0.1)

**A view of how fast each project moves and how often it breaks production, inspired by DORA
but sized for one person and a team of agents.** It is backlog item PM9. Nothing here needs
collecting in advance: every source below can be backfilled from GitHub, so it can follow v0.1
without losing history.

### 16.1 What is measured

| Measure | How | Source |
| ------- | --- | ------ |
| **Deployment frequency** | production deploys per week, **leaving out deploys of a Project Magic edit** (a squash commit from a `projectmagic` PR), which change nothing that runs | GitHub Deployments, which Vercel writes (`Production – <project>` environments) |
| **Lead time for changes** | a merged PR's first commit to the production deploy that contains its merge commit | PRs and Deployments, matched by sha ancestry |
| **Change failure rate** | production bug-fix PRs over production deploys, over a rolling 4 weeks | PRs with `Bug: production` (§5.3) |
| **Time to restore** | `Raised:` (or the fix branch's first commit, if absent) to the production deploy containing the fix | the same PRs, and Deployments |
| **Throughput** | items done per week, **weighted by size** (S = 1, M = 3, L = 8; ranges take the midpoint), and plan tasks done per week | backlog and `PROGRESS.md` history (§7.3) |
| **Item lead time** | an item first appearing in `backlog.md` to its removal or `done` | backlog history |
| **Cycle time** | an item's first `in progress` evidence (meta or a linked branch) to done | backlog history and branches |
| **The founder queue** | items in `built` or `blocked` whose waiting reason needs the owner: how many, and how long each has waited | current meta lines, and history for the age |
| **Main health** | the share of CI runs on main that fail, and how long main stays red. **A run whose jobs never started** (no steps ran, as when Actions billing fails) **is not a failure**: it is left out, and the gap is shown | GitHub Actions runs and their jobs |

**The founder queue is the measure most specific to agent-built projects.** Agents finish work
faster than one person can accept it. Orchard has 14 items `built` and waiting on a step by
hand, such as opening DXF files in three CAD programs, a console change or the lawyer. The
bottleneck is the owner, and this shows its size and age.

### 16.2 What is deliberately not measured

- **PR counts, commits and lines of code as velocity.** Agents make them cheap, so they measure
  the agents' verbosity, not progress. They are shown as context, never as a headline.
- **Story points.** Size is a rough weight, used only to stop ten S items looking like ten L ones.
- **Comparisons between projects.** Each project's figures are shown against its own past.

### 16.3 Honest numbers

- **Small counts are shown as counts.** A rate is shown only when its denominator is at least
  10. "2 of 7 deploys" is more honest than "29%".
- **Trends, not targets**: weekly bars with a 4-week rolling line, and no red or green
  thresholds.
- **Every figure links to its evidence**: the deploys, PRs or items it counts.

### 16.4 Bugs

A production bug is a **merged PR whose body says `Bug: production`** (§5.3), which is how an
agent fixes one today: on a `fix/` branch, usually straight away. A bug that isn't fixed
straight away is a backlog item with `Type: bug`, plus `Found: production` and `Raised:` on its
meta line. Its fix PR cites it with `Backlog:`, so the item's `Raised:` date is the start of
time to restore. This joins PM2: bug items are the backlog half, and bug-fix PRs are the
measured half.

`fix/` PRs without a `Bug:` line, such as a broken build on main, are fixes but not production
bugs, and count only towards main health. That matters: lantern's eight `fix/` PRs so
far include both kinds.

**Later sources**, once the convention has proved itself: lantern's failure log
(`PROGRESS.md` 8.8) and orchard's alerts, each read through a small read-only endpoint, would
show production faults that no PR has fixed yet.

### 16.5 Where it appears

- **On the overview card**: one line of four figures per project (deploys this week, median lead
  time, production bugs in the last four weeks, the founder queue), each a link.
- **A Delivery tab per project**: the charts in §16.1, a list of production bugs with time to
  restore, and the founder queue, oldest first.

### 16.6 Data

The sync (§7) adds two fetches, both cheap and both incremental:

- **Deployments.** `deployments(environments: [...], first: 100)` with statuses. Only
  production environments, and only those in `.projectmagic.yml`'s
  `production_environments` (default: any environment whose name starts with `Production`).
- **Workflow runs** on main, through REST, newest first, until a run already stored is reached.

A new `event` table holds `(project_id, kind, at, sha, ref, data)` for deploys, merged PRs, CI
runs and status changes, keyed so that a re-sync is idempotent. The backlog history walk (§7.3)
records **every status change** per item, not only removals, which is what cycle time and the
founder queue's ages need.
