# Backlog

**What is not built and not yet planned.** `spec.md` describes v0.1, and `PROGRESS.md` holds its
build plan. Items here come after v0.1. They are written to `specs/conventions.md`, so Project
Magic can read its own backlog.

## After v0.1

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

From Stitch's *Awaiting Human Check* screen (`design/stitch/x-awaiting.png`): an **Accept**
button on each built item in the founder queue (and on the item page) that marks it done. It is
an ordinary edit (§10): the meta line's status becomes `done`, through the `projectmagic`
branch, so it needs phase 5's write path. It turns the queue from something to read into
something to clear.
