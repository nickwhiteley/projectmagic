# Backlog

**What is not built and not yet planned.** `spec.md` describes v0.1, and `PROGRESS.md` holds its
build plan. Items here come after v0.1. They are written to `specs/conventions.md`, so Project
Magic can read its own backlog.

## After v0.1

### PM26 Hide Done
**Status:** done · **Size:** S · **For:** person.nickwhiteley

Hide Done items from the List view.

### PM27 Board drag changes status
**Status:** done · **Size:** S–M · **For:** person.nickwhiteley

When i drag an item on the Board view into a different status it should update the status as though I had used the Edit screen.  This is particularly important to move from built to done as they are all done by a person.
Looks like PM11 has similar ideas

Built with PM11, which asked for the same thing. Dropping a card into a column whose status can be set
(todo, blocked, built or done) is the same edit as saving the Edit form with that status. Moving
to `done` clears *Waiting*. Blocked and built ask what the item waits on when it has no reason
yet. In progress and in review can't be dropped into, and the Board says so. Reordering within a
column works as before, and is off while the For filter is on.

### PM17 A new item can 404 after Add, with nothing shown while it saves
**Status:** done · **Waiting:** Nick's check · **Size:** S · **Type:** bug · **For:** person.nickwhiteley

Reported by Nick on 2026-10-15. After **Add** on the add item screen nothing happens on screen for
several seconds, then the browser goes to the new item's page and it says 404. Opening the list
shows the item, so it was added. It happens only some of the time.

**The 404 is a race between the edit's sync and a webhook's.** An add commits to the
`projectmagic` branch, opens a PR and merges it, and each of those sends GitHub webhooks that
start a background sync. Then `edits.edit()` calls `syncNow()`. If a webhook's sync is already
running, `syncNow()` doesn't wait for it: it marks the project to sync again and returns
`'queued'` at once. The action redirects, the item page reads the cache from before the merge,
and the item isn't there yet. Whether a webhook gets in first is down to timing, hence
intermittent. GitHub's API can also return main's old head for a moment after a merge, which
fails the same way.

The fix:

- **After an edit, wait for a sync that includes the merge**: `syncNow()` gains a way to wait
  for the queued run to finish (polling `sync_started_at` until it clears, with a limit of about
  ten seconds), and the sync checks that main's head is the merge commit, retrying once if
  GitHub still returns the old one.
- **The item page doesn't 404 for an item just added**: if the item is missing but `edit_log`
  holds an add of that id in the last minute, show "Being added" and refresh, rather than an
  error.
- **The form shows that it is saving**: `use:enhance` with the button disabled and saying
  *Adding…* (*Saving…* on the edit screen) until the response, like PM13's navigation feedback.
- **A test** for `syncNow()` returning `'queued'` during an edit: the edit still waits until the
  item is in the state.

### PM24 Deleted items show as shipped
**Status:** done · **Waiting:** Nick's check · **Size:** S · **Type:** bug · **For:** person.nickwhiteley

Reported by Nick on 2026-10-15. An item deleted with **Remove → Delete it from the backlog now**
appears on the Done tab, the Board's shipped column and its own page as *shipped*. PM15, PM18
and PM23, all test items, show this way now.

Done detection (spec §7.3) treats every id that leaves main's backlog as shipped, because agents
prune shipped items without marking them done first. Project Magic's own delete looks the same
in the history.

**The fix:** Project Magic knows which removals were its deletes, because `edit_log` holds a
`remove` row for each (PM15 in #35, PM18 in #33 and PM23 in #41). An id whose removal matches one
is *deleted*:

- left off the Done tab's shipped list, the Board's shipped column and the overview's counts,
  and listed in a collapsed *Deleted* list at the bottom of the Done tab;
- its page says "Deleted on 15 Oct by @nickwhiteley", with its last text, not "shipped";
- its id still counts as used, so it is never suggested again.

A removal made outside Project Magic stays shipped, as now. It applies to past deletes too, since
the `edit_log` rows are there. Spec §7.3 and the Done view (§9) say so.

**Decided by Nick on 2026-10-15:** deleted items are listed in a collapsed *Deleted* list at
the bottom of the Done tab. A `dropped` status, for deletes made outside Project Magic, waits
until it is needed.

### PM25 Batch edits: save several changes as one commit
**Status:** done · **Branch:** `feat/pm25-batch-edits` · **Size:** M · **Type:** feature · **For:** person.nickwhiteley

Asked for by Nick on 2026-10-15. Every edit is its own commit, PR and squash merge on GitHub
(§10.2), which takes seconds and adds one commit to main per click. Several small changes in a
row, such as setting a few statuses or reordering the backlog, are slow and fill main with
`Backlog: edit …` commits.

An optional **batch mode**: edits are applied to a working copy of `backlog.md` held by Project
Magic, shown at once in the views as pending, and saved to GitHub together every few minutes or
on request. The save is one commit on the `projectmagic` branch and one PR, merged as today, so
main gets one commit for the batch.

- **A project setting** (`.projectmagic.yml`, next to `auto_merge`) and a per-user choice, off by
  default on (Nick's choice, 2026-10-16), so a project or a person can opt out and save each edit at once.
- **The pending edits are stored in Postgres**, per project, as the item edits themselves (id,
  operation, base `oid`), not as a whole file, so the batch can be replayed on the current
  backlog and a later edit by an agent doesn't conflict with it.
- **Save now** applies the pending edits in order to the current backlog on main in one commit.
  A scheduled save (a cron every few minutes, or after a quiet period) does the same.
- **Conflicts**: an edit whose item has changed on main since it was made is left pending and
  shown, with the others saved.
- **The views** show the pending edits on top of the cached state, marked as unsaved, with a
  count and a *Discard* for each.

**Decided with Nick (2026-10-16):** pending edits are kept in the database, per project (browser
local storage would be per user and invisible to the server and to agents). A batch is saved after
a quiet minute and at most five minutes after the first edit, triggered by page loads and webhooks,
with the page reloading itself when one is due, and the daily cron as the backstop. Built in
spec §10.5.

**Review fixes (2026-10-16):** an edit saved at once is built from main without anyone's pending
edits, so it can't carry them to main or hit a false conflict. A batch logs each edit under its
author, so the PR body, deleted detection and just-added checks see them. A page load saves a due
batch in the background instead of waiting for it. A pending edit can't be discarded while a save holds it.

### PM1 Epics
**Status:** built · **Waiting:** Nick's check · **Size:** M · **Type:** feature · **For:** person.nickwhiteley

Group items under an epic (`Epic: EP3`), declared in `backlog.md` or in `epics.md`. The views
are an epic roll-up across its items' statuses, and an epic filter on the Board and List.
`spec.md` §13.

Built for epics declared in `backlog.md` as an `### EP3 Title` item or a `## EP3 Title` section.
The Epics tab lists each epic with a bar by status, its items and the ones that shipped; the List
and the Board filter by epic (`?epic=EP3`); rows and cards show the id; a value that isn't an
epic id is flagged in the health panel. `epics.md` and the form's Epic field are PM28.

### PM28 Epics: an `epics.md` file and an Epic field on the item form
**Status:** built · **Waiting:** Nick's check · **Size:** S · **Type:** feature · **For:** person.nickwhiteley

What PM1 left out. `spec.md` §13 lets an epic be declared in its own `epics.md`, with a short
description and an optional target, so the sync fetches and caches that file and the Epics tab
shows the description and target. The add and edit forms get an *Epic* field that suggests the
declared epics, so a person can set it without editing the file.

Built: the `epics` key in `.projectmagic.yml` (default `epics.md`, `null` to not read one). Each
`###` or `##` heading `EP3 Title` in it declares an epic, the text under it is the description (as
markdown), and a `**Target:** …` line, or a `Target` key on a meta line, is the target. The sync
reads it from `main` only, and the Epics tab shows both. An epic declared in both files takes its
title from `backlog.md` and its description and target from `epics.md`; one declared only in
`epics.md` still appears. The add and edit forms have an *Epic* field with the declared epics as
suggestions; it accepts `EP` and a number, and clearing it removes the key.

### PM6 Edit `PROGRESS.md` status cells and docs
**Status:** built · **Waiting:** Nick's check · **Size:** M · **Type:** feature · **For:** person.nickwhiteley

The item was a title only; this is what I took it to mean (`spec.md` §13). Say if it should be less
or more.

Built:

- **Plan status cells**: each task on the Plan page has an *Edit* (for editors) with the status
  and a note. It rewrites only that cell in `PROGRESS.md`: a bold word stays bold, the note after
  it stays unless changed, a pipe in a note is escaped, and a number repeated across tables edits
  the current row. If the cell changed on main since the page was shown, it is a conflict.
- **Documents**: a document on main has an *Edit* (`/p/<repo>/edit-doc/<path>`) with its text in a
  box, saved whole, as one commit. Only the project's `docs` files, at most 1 MB; files with
  Windows line endings keep them. A change on main since it was opened is a conflict, offering
  your text over the new version.
- Both go through the same path as backlog edits (the `projectmagic` branch, merged at once, the
  edit log, the pending-PR rules).
- **Not built**: a document editor with a preview, and creating or deleting documents or plan
  tasks.

### PM8 Mermaid in rendered docs
**Status:** built · **Waiting:** Nick's check · **Size:** S · **Type:** feature · **For:** person.nickwhiteley

Built: a ```mermaid fence is drawn in the browser by Mermaid 11.17.2 with its strict security
level, loaded only on a page that has a diagram. A diagram with an error keeps its source and
says what is wrong. `npm audit` reports two low-severity advisories for Mermaid's KaTeX
dependency; the fix is Mermaid 12.2.0, released on 2026-10-13, which is worth taking once it has
aged.

### PM20 Tenants: one Project Magic for many teams
**Status:** built · **Waiting:** Nick's check · **Size:** L · **Type:** feature · **For:** person.nickwhiteley

**Specced:** `specs/tenants.md` (2026-10-16). Four phases, one PR each: the tenant model and
scoping; sign-up and installations; members and access; tiers, quotas and billing. Nick answered
its questions on 2026-10-16 (its §15).

**Phase 1 (the tenant model and scoping) is merged** (#61); phase 2 (sign-up, installation claims and the admin screens) is merged (#62); phase 3 (members and access, with PM7) is merged (#63); phase 4 (tiers, quotas and billing) is built on `feat/pm20-tiers-billing`, so all four phases are in. See `specs/tenants.md` §14
for what each phase settled. 

**PM7 is folded in** as phase 3: invitations, the member list per project, changing a role and
disabling a user. PM7 asked whether full RBAC should come first, whether roles come from GitHub or
Project Magic, and whether plinth helps: fixed roles, not RBAC (§6.4); project roles from GitHub
permissions by default, managed in Project Magic as an option (§6.1, §6.2); plinth's designs, not its
code (§10).

Anyone could set up Project Magic for their own organisation and invite their colleagues,
without deploying their own copy. Today each deployment belongs to one person: the GitHub App's
credentials are environment variables, and every installation's repositories belong to it.

There are two ways to do it, and the choice decides most of the work:

- **One public GitHub App that any organisation installs.** Each installation becomes an
  organisation in Project Magic. Projects are already keyed by `installation_id`, so this mostly
  adds an `organisation` table, ties memberships and projects to it, and scopes every query and
  `can()` check to the signed-in user's organisations. No secrets are stored per organisation.
- **Each organisation registers its own GitHub App** and its id, private key and webhook secret
  are stored in the database, encrypted. More isolation, but every organisation does the App
  set-up from the README, and the app has to route webhooks and sign tokens per organisation.

The first draft put PM7's invitations before it. The spec reverses that: tenants come first, and
invitations are its phase 3.

**Questions for Nick:**

- **Hosted or self-hosted?** Is this a service you run for other people, or a self-hosted copy
  that serves several organisations? A hosted service brings billing, terms, privacy and support,
  and changes what the README promises ("it runs on your own accounts"). - Both options.  Primary is hosted with the Github login telling us what they have access to. The repo is still open source.
- **One App or one per organisation?** The first is much less work; is there a reason to need
  the second? - One app
- **Can a person belong to more than one organisation?** And who creates one: anyone who signs
  in, or only people you approve? - This would probably work but is not the intended approach.
- **Does single-owner self-hosting stay supported** as it is today? - Yes

Note that Organisation is a Github term so could be confusing particularly as one person could have access to multiple linked Github organisations.  Project Magic should call them tenants. Settings are at tenant level and there are tenant admins as well as Project Magic platform admins (me!).  Tenant signup must support payment as a stub, particularly for tiers with AI model access and large numbers of users.

This feature will need a full admin screen implementation.
Look at plinth for help

### PM34 Mobile view
**Status:** todo

Cluttered and body text box is too narrow

### PM35 Feedback button
**Status:** todo

Feedback buttons and box like in Bloomprint. Perhaps add to plinth.

### PM33 Auto initialise a repo
**Status:** todo

Automatic creation of backlog.md, bug.md and project magic.yml when a new repo is added to the app.

### PM22 Make the item form explain itself, and add Type
**Status:** todo · **Size:** S · **Type:** feature · **For:** agent

Raised by Nick on 2026-10-15: the add item screen has no **Type**, and **Job** and **Plan tasks**
don't say what they are.

- **Type**: a select with `feature`, `bug` and `chore`, written as `**Type:**` on the meta line.
  The conventions already accept it; the form just never offered it. PM2 builds on it.
- **Job**: the area of the product an item belongs to, written as a trailing ` — WORD` on the
  heading (`### OR12 Invoices as PDF — MONEY`) and filterable on the List. Rename the field
  **Area**, or keep *Job* with a hint under it: "The part of the product this belongs to, such
  as MONEY. It is shown after the title."
- **Plan tasks**: the `PROGRESS.md` task numbers that build the item, written as `**Plan:**`.
  Add a hint ("Which tasks in the plan build this, such as 3.4") and hide the field when the
  project has no plan.
- **A one-line hint** under every field that isn't obvious, in the same words as
  `specs/conventions.md`.

**Question for Nick:** rename Job to Area everywhere (heading tag, filter, form), or only
explain it on the form?  - A rename is clearer I think

### PM12 A home page that explains Project Magic, and a README for strangers
**Status:** done · **Size:** M · **Type:** feature · **For:** person.nickwhiteley

- **`/` for a signed-out visitor** is a home page instead of a redirect to sign in: what Project
  Magic is (a dashboard over backlogs, plans, branches and PRs that AI agents keep in markdown in
  GitHub), why it helps (see every project's state without asking an agent in each repository;
  what is waiting on you; edits that land on main as ordinary commits), and the setup at a high
  level, linking to the README for the detail. Signed in, `/` stays the overview. In the look of
  `design/README.md`, with an example built from made-up data.
- **The README** is written for a stranger: what it is and who it is for, an image, how it works,
  the conventions, setting up the GitHub App, the database and the environment, running locally,
  deploying, adding a repository, developing, and where things are. MIT licence.
- **The current files hold nothing private**: the fixtures are two made-up projects (Orchard and
  Lantern), the Stitch exports are gone, and the real projects' names and details are replaced.
  The history still holds them; that is PM14.

### PM14 Make the repository public
**Status:** done · **Size:** M · **Type:** chore · **For:** person.nickwhiteley

Nick has decided to keep the repository private for now (2026-10-14). The current files are
clean (PM12), but the history and GitHub still hold two private projects' backlogs and plans:

- **The git history**: every earlier commit has the old fixtures, golden files and Stitch exports,
  and the projects' names and details in the spec, the plan and the tests. A rewrite removes the
  paths and applies the same replacement map PM12 used, so the real names become Orchard and
  Lantern.
- **GitHub's pull requests**: closed and merged PRs keep their descriptions, their diffs and the
  commits behind them, which a force-push doesn't reach. PR #6's diff holds both backlogs in full,
  and many descriptions quote them. Only deleting the repository removes them.

So going public is one of: delete the repository and push the rewritten history to a new one with
the same name (losing the PR history; the GitHub App is reinstalled and Vercel reconnected, since
the repository's id changes), or keep this one private as the full record and publish the
rewritten history as a new repository under another name. Nick chooses when the time comes.

### PM2 Bug items
**Status:** done · **Size:** S · **Type:** feature · **For:** person.nickwhiteley

`Type: bug` on an item, with `Found:` and `Raised:`, and an optional `bugs.md` as a second
backlog file with a `BUG` prefix. The board gains a type filter and a bug lane. `spec.md` §13
and §16.4. PM9 measures the bugs that PRs fix; this shows the ones still open.

Built: `Type:` (any value; `bug` gets a red tag), `Found:` and `Raised:` show on the item page, and
the List and the Board filter by Type when the project uses it. **Left for PM29:** the optional
`bugs.md` second backlog file with a `BUG` prefix, and a separate bug lane on the Board (the Type
filter covers showing only bugs).

**Fix (2026-10-16):** the List has an *Add bug* button. The form was only reachable from *Add item*, and
only when a `bugs.md` existed. With none, the bug is added to the backlog with `Type: bug`.

### PM29 Bugs: a `bugs.md` file and a bug lane on the Board
**Status:** done · **Size:** M · **Type:** feature · **For:** person.nickwhiteley

What PM2 left out. `spec.md` §13 and §16.4 let bugs live in an optional `bugs.md`, configured as
a second backlog file with a `BUG` prefix, so the sync fetches and caches it, ids come from the
prefix, and the views read two backlogs. The Board gets a bug lane beside the section lanes.

Built: the `bugs` key in `.projectmagic.yml` (default `bugs.md`, `null` to not read one) and
`bug_prefix` (default `BUG`). The sync fetches and caches the file on every branch, and the state
merges its items after the main backlog's, in a *Bugs* section (the Board's bug lane), each marked
with its file. An item there with no `Type` counts as a bug. Edits, status changes, removals and
moves go back to the file the item is in; a move can't cross files. *Add a bug* (`/new?bug=1`)
starts a bug with the `BUG` prefix in `bugs.md`, after its last bug. Done detection reads both
files as one list, so a bug removed from `bugs.md` shipped. An id in both files is shown once and
flagged. **Not built:** a project's first `bugs.md` has to be created in the repository; the add
form only adds to a file that exists.

### PM3 Inferred status for items with no meta line
**Status:** done · **Size:** M · **Type:** feature · **For:** person.nickwhiteley

A model reads the prose and proposes a status and waiting reason. It is cached by blob `oid` and
shown as *inferred*.


Model is selectable (OpenAI, Anthropic, Ollama) but initially uses Ollama models.
Limits on token usage per tenant (see PM20) or designed with tenant in mind. Users and tenants can opt out.

Built (PM3 answers).

- **Model**: chosen by environment, `INFERENCE_PROVIDER` of `ollama`, `openai` or `anthropic`,
  with `INFERENCE_MODEL`, `INFERENCE_BASE_URL` (Ollama) or `INFERENCE_API_KEY`. Unset, it is off.
  Ollama is the first target; it must be reachable from where the app runs, so a hosted app needs
  an Ollama on a public address, or one of the other providers.
- **What it does**: after a sync, a few items (5 at most) with no meta line and no current
  proposal are sent to the model, which answers with a status and a waiting reason. The proposal
  is cached in `item_inference` against the item's text and is dropped when the item changes. It
  shows as *inferred* on rows and the item page, and never changes the derived status.
- **Limits**: `INFERENCE_DAILY_TOKEN_LIMIT` tokens a day, default 50 000, counted by scope
  (`project:<id>` now). **Left for PM20:** a `tenant:<id>` scope and per-tenant limits, which need
  tenants to exist.
- **Opt out**: a project with `inference: false` in `.projectmagic.yml` is never sent, standing in
  for the tenant opt-out until PM20; a person can hide the proposals from their own views with the
  *Inferred statuses* button in the header (shown only when a model is configured).
- **Before deploying**: `make migrate` creates `item_inference`, `inference_usage` and
  `user_pref` (`migrations/003_inference.sql`). The app copes with the tables missing, and shows
  no proposals until they exist.

### PM4 Ask across projects
**Status:** done · **Size:** M · **Type:** feature · **For:** person.nickwhiteley

A question box answered from the cached parses.

Built as the *Ask* page, shown in the navigation when a model is configured (PM3's `INFERENCE_*`
variables). The page sends the question with a digest of every project you can see: each item's
id, status, title, what it waits on, who it is for, epic, type, size, branches and PRs, and what
shipped in the last 30 days. The digest is about 28 000 characters, split evenly between projects,
and says when items were left out. The model is told to use only the digest and to cite items as
`[repo:ID]`; a citation becomes a link only if that item is in the digest, so an invented or
injected link is dead text.

- **Cost**: counted per person against `INFERENCE_DAILY_TOKEN_LIMIT`, in `inference_usage` under
  `ask:<user>`. Needs PM3's migration (`make migrate`).
- **Opt out**: a project with `inference: false` is left out of the digest, and a person who hid
  AI features can't ask.
- **Not in it**: no memory between questions, and no search of item bodies, which the digest
  leaves out to stay small. A body-level question would need retrieval first.
### PM5 Activity feed
**Status:** done · **Size:** S · **Type:** feature · **For:** person.nickwhiteley

Recent commits across every project, grouped by linked item.

Built as the *Activity* page in the navigation: the last 14 days across every project you can
see, grouped by the item each was about. Each active branch shows its latest commit, since the
sync caches only a branch's head, and an item that shipped shows once, with its PR. Branches that
no item links to are listed under "not linked to an item". Project Magic's own edits and
deployment branches are left out. A full commit history would need the sync to cache commits.

### PM21 Images in rendered docs
**Status:** done · **Size:** S · **Type:** feature · **For:** person.nickwhiteley

The Docs tab shows a document's images as broken: `render.ts` resolves a relative `src` to the
docs view, as it does for links, and GitHub's raw URLs need a token for a private repository.
Serve an image from the branch's tree through the app, with the installation token and the
project's view permission, cached by blob oid like `doc_blob`. SVG goes out as an image with a
restrictive `Content-Security-Policy`, never inline, since a branch can hold anything an agent
wrote. `docs/architecture.md` is the first document that needs it.

Built: `/p/<repo>/raw/<path>` serves an image from a branch's tree through the GitHub contents
API with the installation token, for png, jpg, gif, webp and svg up to 1 MB, with the project's
view permission. An SVG is sent with `Content-Security-Policy: default-src 'none'; sandbox`, so
it can't run script. The browser caches an image for 5 minutes and revalidates by blob sha; the
Postgres cache the item suggested isn't needed for that.

### PM19 An Edit button in the expanded list row
**Status:** todo · **Size:** S · **Type:** feature · **For:** person.nickwhiteley

On the List, a row opens to show the item's detail, but editing means opening the item's page
first. Add an **Edit** button at the bottom of the open row, going to `/p/<repo>/i/<id>/edit`,
shown only to people who can edit the project.

**Question for Nick:** should the Board's cards get the same button?

### PM9 Delivery and quality
**Status:** done · **Size:** M · **Type:** feature · **For:** person.nickwhiteley

DORA's four measures sized for one person and a team of agents: deployment frequency, lead time
for changes, change failure rate and time to restore, from Vercel's GitHub deployments and
`Bug: production` PRs. Plus size-weighted throughput, item lead and cycle time, main's CI health,
and **the founder queue**: the built and blocked items waiting on the owner, and how long each
has waited. A line on each overview card, and a Delivery tab. `spec.md` §16.

The `Bug:` PR convention went into orchard#35 and lantern#70 on 2026-10-14, so
production bugs are labelled from now on. Earlier `fix/` PRs aren't labelled and are counted as
fixes, not production bugs.

Built (`spec.md` §16.7 says how it differs from the plan):

- **Data**: migration `004_events.sql` adds an `event` table (production deploys, merged PRs, CI
  runs on main, status changes). The sync reads them from GitHub incrementally and never fails
  because of them. Without the migration everything works and the tab is empty. It also restarts
  the backlog history walk so every past status change is recorded.
- **Figures** (pure functions, tested): deploys a week (edit deploys left out), lead time, change
  failure, time to restore, size-weighted throughput, item lead and cycle time, the founder queue
  with ages, and main's CI where a run that never started is not a failure. Counts stay counts
  until a denominator reaches 10; no thresholds; weekly bars with a 4-week rolling line.
- **Where**: a *Delivery* tab per project, and a line on each overview card (deploys this week,
  lead time, production bugs in 4 weeks, the queue), each linking to the tab.
- Tried against the real GitHub API for this repository (12 production deploys, 3 of them edits)
  and plinth (CI runs and PRs).
- **Not built**: plan tasks a week, ancestry matching for deploys, per-project thresholds.

### PM10 Accept a built item from the founder queue
**Status:** done · **Size:** S · **Type:** feature · **For:** person.nickwhiteley

From Stitch’s *Awaiting Human Check* screen: an **Accept**
button on each built item in the founder queue (and on the item page) that marks it done. It is
an ordinary edit (§10): the meta line's status becomes `done`, through the `projectmagic`
branch, so it needs phase 5's write path. It turns the queue from something to read into
something to clear.

Built: an **Accept** button on each built item in the Overview's *Waiting on you* list and on
the item page, for people who can edit. It is the Board's status edit with `done`, so *Waiting*
is cleared, and it returns to where it came from.

### PM11 Set an item's status by dropping it into a Board column
**Status:** done · **Size:** S · **Type:** feature · **For:** person.nickwhiteley

Dropping a card into another column on the Board only reorders it today (task 5.3). Make a drop
into **todo**, **blocked**, **built** or **done** also set `Status:` in the item's meta line, as an
ordinary edit through the `projectmagic` branch (§10). **in progress** and **in review** come from
branches and PRs (§7.2), so a drop there still only reorders, and the Board should say so. A drop
into blocked or built should ask for the *Waiting* reason. Asked for by Nick on 2026-10-14, after
dragging E5 expecting its status to change.

Built with PM27.

### PM13 Show that a navigation is under way
**Status:** done · **Size:** S · **Type:** feature · **For:** person.nickwhiteley

Straight after PM12. Clicking a project in the left navigation can take seconds before anything
changes, so people click again and again. Show at once that something is happening: the clicked
link marked as current and busy, and a thin progress bar at the top while SvelteKit navigates
(`navigating` from `$app/state`), as on every navigation. Then find out why it is slow, rather
than only hiding it: a project page reads the cached state from Postgres and should not call
GitHub on the way, so measure the load on Vercel (cold starts, Neon's connection, building the
project's state) and fix what dominates.

### PM16 Assign items to a person or an agent, and filter by it
**Status:** done · **Size:** M · **Type:** feature · **For:** person.nickwhiteley

So Nick can see what to work on, and agents can see what is theirs. Answers from Nick on
2026-10-15.

**The assignment is a meta key, `For:`, in `backlog.md`**, where agents read it too:

    **Status:** todo · **Size:** S · **For:** person.nickwhiteley

- **The value is a dotted path**, free text whose first part is `person` or `agent`:
  `person` (any person), `person.nickwhiteley` (a GitHub login), `agent` (any agent),
  `agent.claude` (any Anthropic agent), `agent.claude.opus` (one model family). Anything else is
  kept, shown, and flagged in the health panel.
- **Agents name themselves `agent.<maker>.<family>`**, worked out from their own model, with no
  version: Claude Opus 5.5 is `agent.claude.opus`. A version would add dots, and dots are levels.
- **One value per item.** The hierarchy covers "any of these".
- **No `For:` means anyone's.**

**What matches what.** An item belongs to everyone its path covers, and to everyone below that:

- A filter shows items for that path or below it, items for a more general path above it, and
  unassigned ones. Nick's "mine" (`person.nickwhiteley`) is items for `person.nickwhiteley`,
  for `person`, and for no one.
- So an agent running as `agent.claude.opus` may take items for `agent.claude.opus`,
  `agent.claude`, `agent` or no one, and not `agent.claude.sonnet` or anything for a person.

**What it adds:**

- **The parser** reads `For:` (no change to status derivation), and checks its first part.
- **The List and the Board** get a *For* filter: *Mine*, *People*, *Agents*, and each value in
  use, mirrored in the URL like the List's other filters. The value shows on rows and cards.
- **The add and edit forms** get a *For* field, suggesting the values in use, empty by default.
- **`specs/conventions.md`**, for agents:
  - work only on items for you, for a path above you, or for no one;
  - you may hand an item to a person, such as one you are blocked on, by setting `For:` to
    them;
  - take an item assigned to a person only when that person says so, and then set `For:` to
    yourself;
  - when you set an item to `built` and it needs a person to check it, set `For:` to that
    person (`person`, or `person.<login>` when you know who).
- **`spec.md`** §5.1 (the key) and §9 (the filter).

### PM30 Alternate Git suppliers
**Status:** todo · **Size:** M–L

Such as BitBucket

### PM32 Information for agents
**Status:** todo · **Size:** M · **For:** agent

WHen a person writes a comment in a ticket/backlog item there needs a way for that to get to the working agent. Either as some sort of comment box or a flag to say to agents to review teh backlog item prose. Then next time the agent reviews the backlog it will know there is something to look at.
