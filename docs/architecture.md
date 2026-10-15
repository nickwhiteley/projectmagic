# Architecture

Project Magic in three C4 views, from the outside in. Status is never stored as its own truth: it
is derived from the markdown, branches and pull requests in each repository, and edits go back as
ordinary commits. [`spec.md`](../spec.md) has the detail: §7 the sync, §10 editing, §11 sign-in
and access.

In the diagrams, a sand box is a person, a teal box is what that view is about, a white box is a
container or component, and a dashed grey box is outside Project Magic. The teal arrows are the
only path that writes to GitHub.

## 1. System context

Project Magic sits between you and GitHub. AI agents never talk to it directly: they push to
GitHub, and GitHub tells Project Magic something changed.

![System context: you, Project Magic, GitHub, the AI agents and Vercel Cron](architecture/1-context.svg)

Reads use the GitHub App's installation token. Writes use your own token, so GitHub attributes
the commit to you and enforces your permissions. Webhooks carry no data, only a prompt to sync.

## 2. Containers

One SvelteKit app does everything at request time. Postgres is a cache of what GitHub says, plus
the users, memberships and edit log. The same sync code also runs from the command line.

![Containers: the web app, the database and the CLI scripts, with the browser, Vercel Cron and GitHub around them](architecture/2-containers.svg)

The webhook endpoint only verifies the signature and queues a sync; the data always comes from a
fresh GraphQL fetch. `scripts/sync.ts` imports the same `src/lib/server/sync.ts` as the app, which
is why that module has no SvelteKit imports.

## 3. Components of the web app

Three paths run through `src/lib/server`: reading a page, syncing from GitHub, and writing an
edit. All three lean on `src/lib/core`, the parsing and status logic with no I/O.

![Components: hooks.server.ts in front of the read, sync and write paths, over db.ts, the GitHub client and lib/core](architecture/3-components.svg)

After an edit, `edits.ts` hands off to the same sync the webhook would trigger, so the page shows
the commit without waiting for GitHub.

## The decisions these rest on

- **The files are the record.** Postgres holds a cache keyed by git blob oid. Drop it and a sync
  rebuilds it; nothing in it is authoritative except users, memberships and the edit log.
- **Webhooks are triggers, not data.** A verified webhook only asks for a sync. A missed one costs
  freshness, and the daily cron and page loads catch it up.
- **A pure core and a thin shell.** `src/lib/core` parses, links and derives status with no I/O,
  tested against the backlogs in `test/fixtures/` and the parses pinned in `test/golden/`.
- **Access in one table.** `src/lib/server/routes.ts` gives every route one of public, signed-in,
  project, system or machine. A test fails if a route is missing from it.

## Keeping this current

The diagrams are SVG files in [`architecture/`](architecture/), drawn by hand. When a change adds
a container, a path through `src/lib/server` or a new way of reaching GitHub, edit the SVG in the
same pull request. Each file styles itself for light and dark from its own `<style>` block.
