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

`Type: bug` on an item, with an optional `bugs.md` as a second backlog file with a `BUG`
prefix. The board gains a type filter and a bug lane. `spec.md` §13.

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
