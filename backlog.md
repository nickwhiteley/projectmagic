# Backlog

**What is not built and not yet planned.** `spec.md` describes v0.1, and `PROGRESS.md` holds its
build plan. Items here come after v0.1. They are written to `specs/conventions.md`, so Project
Magic can read its own backlog.

## After v0.1

### PM17 404 for new items
**Status:** todo · **Size:** S

When I create a new item there is no feedback that it is working and then after a while I get redirected to a new page for the item ID but it returns a 404 error.  It looks like timing as going into the list view shows the new item.

### PM16 Select items by actor
**Status:** todo · **Size:** S

Add filtering on each bulk view to allow "Human" or "AI Agent" selection.  This filter should be by user too once we are mulit-user so design for that. Add Item screen should also have assignment of task to a person or an agent.  In time we may also have agents with different models (cheaper, deeper thinker) so consider this in the design.

### PM12 A home page that explains Project Magic, and a README for strangers
**Status:** in review · **Branch:** `feat/pm12-home-and-readme` · **Size:** M · **Type:** feature

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

### PM13 Show that a navigation is under way
**Status:** in review · **Branch:** `feat/pm13-navigation` · **Size:** S · **Type:** feature

Straight after PM12. Clicking a project in the left navigation can take seconds before anything
changes, so people click again and again. Show at once that something is happening: the clicked
link marked as current and busy, and a thin progress bar at the top while SvelteKit navigates
(`navigating` from `$app/state`), as on every navigation. Then find out why it is slow, rather
than only hiding it: a project page reads the cached state from Postgres and should not call
GitHub on the way, so measure the load on Vercel (cold starts, Neon's connection, building the
project's state) and fix what dominates.

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

### PM15 Test item
**Status:** todo · **Size:** S–M

Make projects great again

### PM18 Bug item type
**Status:** todo · **Size:** S

I should be able to add a "bug" item type.

### PM19 List view click to edit
**Status:** todo

On the list view I should be able to click through to edit the item.  It concetinas open and shows the task detail, add a button to go to edit the item at the bottom of the detail panel.
