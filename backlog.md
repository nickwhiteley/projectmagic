# Backlog

**What is not built and not yet planned.** `spec.md` describes v0.1, and `PROGRESS.md` holds its
build plan. Items here come after v0.1. They are written to `specs/conventions.md`, so Project
Magic can read its own backlog.

## After v0.1

### PM17 A new item can 404 after Add, with nothing shown while it saves
**Status:** done · **Waiting:** Nick's check · **Size:** S · **Type:** bug

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
**Status:** done · **Waiting:** Nick's check · **Size:** S · **Type:** bug

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

### PM16 Assign items to a person or an agent, and filter by it
**Status:** in progress · **Size:** M · **Type:** feature · **Branch:** `feat/pm16-assignment`

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
  use, remembered per project. The value shows on rows and cards.
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

### PM19 An Edit button in the expanded list row
**Status:** todo · **Size:** S · **Type:** feature

On the List, a row opens to show the item's detail, but editing means opening the item's page
first. Add an **Edit** button at the bottom of the open row, going to `/p/<repo>/i/<id>/edit`,
shown only to people who can edit the project.

**Question for Nick:** should the Board's cards get the same button?

### PM22 Make the item form explain itself, and add Type
**Status:** todo · **Size:** S · **Type:** feature

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
explain it on the form?

### PM12 A home page that explains Project Magic, and a README for strangers
**Status:** built · **Waiting:** Nick's check · **Size:** M · **Type:** feature

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
**Status:** todo · **Size:** M · **Type:** chore

Nick has decided to keep the repository private for now (2026-10-14). The current files are
clean (PM12), but the history and GitHub still hold two private projects' backlogs and plans:

- **The git history**: every earlier commit has the old fixtures, golden files and Stitch exports,
  and the projects' names and details in the spec, the plan and the tests. A rewrite removes the
  paths and applies the same replacement map PM12 used (Orchard → Orchard, Lantern →
  Lantern, and so on).
- **GitHub's pull requests**: closed and merged PRs keep their descriptions, their diffs and the
  commits behind them, which a force-push doesn't reach. PR #6's diff holds both backlogs in full,
  and many descriptions quote them. Only deleting the repository removes them.

So going public is one of: delete the repository and push the rewritten history to a new one with
the same name (losing the PR history; the GitHub App is reinstalled and Vercel reconnected, since
the repository's id changes), or keep this one private as the full record and publish the
rewritten history as a new repository under another name. Nick chooses when the time comes.

### PM1 Epics
**Status:** todo · **Size:** M · **Type:** feature

Group items under an epic (`Epic: EP3`), declared in `backlog.md` or in `epics.md`. The views
are an epic roll-up across its items' statuses, and an epic filter on the Board and List.
`spec.md` §13.

### PM2 Bug items
**Status:** todo · **Size:** S · **Type:** feature

`Type: bug` on an item, with `Found:` and `Raised:`, and an optional `bugs.md` as a second
backlog file with a `BUG` prefix. The board gains a type filter and a bug lane. `spec.md` §13
and §16.4. PM9 measures the bugs that PRs fix; this shows the ones still open.

### PM3 Inferred status for items with no meta line
**Status:** todo · **Size:** M · **Type:** feature

A model reads the prose and proposes a status and waiting reason. It is cached by blob `oid` and
shown as *inferred*.

### PM4 Ask across projects
**Status:** todo · **Size:** M · **Type:** feature

A question box answered from the cached parses.

### PM5 Activity feed
**Status:** todo · **Size:** S · **Type:** feature

Recent commits across every project, grouped by linked item.

### PM6 Edit `PROGRESS.md` status cells and docs
**Status:** todo · **Size:** M · **Type:** feature

### PM7 More users: invitations, members and roles
**Status:** todo · **Size:** M · **Type:** feature

The model and `can()` exist in v0.1 (`spec.md` §11.2). This adds the screens: invite by GitHub
login, the member list for each project, changing a role, and disabling a user.

### PM8 Mermaid in rendered docs
**Status:** todo · **Size:** S · **Type:** feature

### PM21 Images in rendered docs
**Status:** todo · **Size:** S · **Type:** feature

The Docs tab shows a document's images as broken: `render.ts` resolves a relative `src` to the
docs view, as it does for links, and GitHub's raw URLs need a token for a private repository.
Serve an image from the branch's tree through the app, with the installation token and the
project's view permission, cached by blob oid like `doc_blob`. SVG goes out as an image with a
restrictive `Content-Security-Policy`, never inline, since a branch can hold anything an agent
wrote. `docs/architecture.md` is the first document that needs it.

### PM9 Delivery and quality
**Status:** todo · **Size:** M · **Type:** feature

DORA's four measures sized for one person and a team of agents: deployment frequency, lead time
for changes, change failure rate and time to restore, from Vercel's GitHub deployments and
`Bug: production` PRs. Plus size-weighted throughput, item lead and cycle time, main's CI health,
and **the founder queue**: the built and blocked items waiting on the owner, and how long each
has waited. A line on each overview card, and a Delivery tab. `spec.md` §16.

The `Bug:` PR convention went into orchard#35 and lantern#70 on 2026-10-14, so
production bugs are labelled from now on. Earlier `fix/` PRs aren't labelled and are counted as
fixes, not production bugs.

### PM10 Accept a built item from the founder queue
**Status:** todo · **Size:** S · **Type:** feature

From Stitch’s *Awaiting Human Check* screen: an **Accept**
button on each built item in the founder queue (and on the item page) that marks it done. It is
an ordinary edit (§10): the meta line's status becomes `done`, through the `projectmagic`
branch, so it needs phase 5's write path. It turns the queue from something to read into
something to clear.

### PM11 Set an item's status by dropping it into a Board column
**Status:** todo · **Size:** S · **Type:** feature

Dropping a card into another column on the Board only reorders it today (task 5.3). Make a drop
into **todo**, **blocked**, **built** or **done** also set `Status:` in the item's meta line, as an
ordinary edit through the `projectmagic` branch (§10). **in progress** and **in review** come from
branches and PRs (§7.2), so a drop there still only reorders, and the Board should say so. A drop
into blocked or built should ask for the *Waiting* reason. Asked for by Nick on 2026-10-14, after
dragging E5 expecting its status to change.

### PM13 Show that a navigation is under way
**Status:** built · **Waiting:** Nick's check · **Size:** S · **Type:** feature

Straight after PM12. Clicking a project in the left navigation can take seconds before anything
changes, so people click again and again. Show at once that something is happening: the clicked
link marked as current and busy, and a thin progress bar at the top while SvelteKit navigates
(`navigating` from `$app/state`), as on every navigation. Then find out why it is slow, rather
than only hiding it: a project page reads the cached state from Postgres and should not call
GitHub on the way, so measure the load on Vercel (cold starts, Neon's connection, building the
project's state) and fix what dominates.

### PM20 Organisations: one Project Magic for many teams
**Status:** todo · **Size:** L · **Type:** feature

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

It needs PM7's invitations first, and probably splits into: the organisation model and scoping,
sign-up and installing the App, then invitations within an organisation.

**Questions for Nick:**

- **Hosted or self-hosted?** Is this a service you run for other people, or a self-hosted copy
  that serves several organisations? A hosted service brings billing, terms, privacy and support,
  and changes what the README promises ("it runs on your own accounts").
- **One App or one per organisation?** The first is much less work; is there a reason to need
  the second?
- **Can a person belong to more than one organisation?** And who creates one: anyone who signs
  in, or only people you approve?
- **Does single-owner self-hosting stay supported** as it is today?
