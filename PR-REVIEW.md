# PR-REVIEW.md

Configuration for the automated PR review workflow powered by
[pr-reviewer](https://github.com/seethespark/pr-reviewer)
(`.github/workflows/pr-review.yml`). Each `##` section below is read by the
tool — do not rename them.

## Who owns the repo
Nick Whiteley — solo developer.

## Context and intent
Project Magic shows what AI coding agents are building across a set of
GitHub repositories. It reads each repository's backlog and build plan
(markdown), its branches and its pull requests, derives every item's status,
and lets a person edit the backlog: each edit is a commit to a `projectmagic`
branch whose pull request is squash-merged straight away. Stack: SvelteKit 3 /
Svelte 5 (runes) in TypeScript on Vercel, Postgres through `postgres`, the
markdown parsed with remark, a GitHub App for reading and webhooks.

The principles a diff should be held to are in `spec.md` §2, and the code
layout in §12. `spec.md` is authoritative where anything disagrees with it:
- **The repository is the database.** Every fact shown is derived from a
  file, branch, commit or pull request; the cache is keyed by content hash and
  can be discarded.
- **Edits are surgical.** An edit replaces the exact range of one item's
  section and leaves every other byte untouched; a file is never re-serialised
  from a parsed model.
- **Functional core, imperative shell.** `src/lib/core/` is pure: no I/O and
  no imports from `src/lib/server/` or SvelteKit. Decisions live there and are
  tested without a network; the GitHub client, the database and the routes are
  a thin shell.
- **Degrade, don't fail.** A missing table or column (`42P01`, `42703`), file,
  config value or model turns a feature off; it never stops a page or a sync.

## Production status
Live, small scale — deployed on Vercel (`lhr1`) with Neon Postgres, in use by
its author, with multi-tenant sign-up being prepared. Billing is a stub.

## Connected systems
- PostgreSQL via Neon (the cache and all per-tenant state)
- GitHub: a GitHub App (installation tokens, webhooks, GraphQL and REST) and
  each user's own OAuth token, which the edit path commits and merges with
- A model provider for inferred statuses and Ask: Ollama, OpenAI or Anthropic,
  optional and rate-limited per project per day
- A Slack incoming webhook for alerts and the digest
- Vercel Cron for the daily sync

## Intended audience
External developers and teams signed in with GitHub, each in a tenant of
their own; platform admins who run the service.

## Audit level
Medium

## Security level
High — multi-tenant: one tenant's projects must never reach another's, and a
project in another tenant is a 404, the same as one the person can't see. Every
route and server action is in the route table (`src/lib/server/routes.ts`) and
asks the one pure `can(user, action, ctx)` (`src/lib/core/access.ts`); none
checks roles inline. Users' GitHub tokens are stored encrypted and commit as
that user. Webhooks are verified against the secret. Markdown from any branch
is rendered, so it is sanitised.

## PR Hygiene
- [x] H001 README.md is present and up to date
- [ ] H002 CODEOWNERS exists
- [ ] H003 All runtime and dependency versions are up to date
- [ ] H006 Dev container definitions exist and are appropriate

## Code Reviews

`Paths` scopes an agent to the files it actually reviews: it is sent only the
matching part of the diff. A leading `!` subtracts. An empty cell means the
whole diff, which `code-reviewer` keeps so that every changed file, tests
included, is read by at least one agent.

| Plugin            | Subagent           | Paths | Additional |
| ----------------- | ------------------ | ----- | ---------- |
| voltagent-qa-sec  | code-reviewer      |  | Svelte 5 runes throughout; imports use the `#lib` alias with the `.ts` extension; the app's configuration is declared in `src/env.ts` and read from `$app/env/private`; the unit tests run against frozen backlogs in `test/fixtures/` with their parse pinned in `test/golden/`, so a parser change that moves a golden file needs a reason |
| voltagent-qa-sec  | security-auditor   | `src/routes/`, `src/lib/server/`, `src/lib/core/access.ts`, `src/hooks.server.ts`, `migrations/`, `!*.test.ts` | the tenant boundary: every project lookup takes the current tenant except the sync runner, the webhook and the cron; a route missing from the route table is a 500; `can()` decides every permission; user tokens are encrypted with `TOKEN_ENCRYPTION_KEY`; the raw-image route allows only listed image types and refuses `.`, `..`, empty segments and `\` in the path; rendered markdown goes through `rehype-sanitize`; `next` redirects are local paths only |
| voltagent-qa-sec  | architect-reviewer | `src/lib/core/`, `src/lib/server/`, `spec.md`, `specs/`, `!*.test.ts` | the functional core: `src/lib/core/` takes plain data and returns plain data, with no I/O and no imports from the shell; an edit is a splice of one item's range, never a re-serialised file; a feature that depends on a later migration catches `42P01`/`42703` and turns itself off |
| voltagent-data-ai | postgres-pro       | `migrations/`, `*.sql`, `src/lib/server/db.ts`, `scripts/migrate.ts` | migrations are numbered, forward-only and applied once each in their own transaction; they run against a live database alongside the previous deploy, so add before you use and stop using before you drop; connections go through Neon's pooler with `prepare: false` |

## Excluded Paths

Kept out of every agent's diff, on top of the tool's own defaults (vendored
trees, lockfiles, generated code, `CLAUDE.md` and this file). These record
plans and build state rather than design or behaviour.

- `PROGRESS.md`
- `backlog.md`
- `bugs.md`
- `epics.md`
- `test/golden/`

## Running locally

Install the tool once:

```sh
go install github.com/seethespark/pr-reviewer/cmd/review@v0.1.14
```

Run against the current branch (compares to `main`):

```sh
review
```

Run against a specific GitHub PR:

```sh
review --pr <number>
```

## CI workflow

`.github/workflows/pr-review.yml` runs `review` on every pull request into
main and posts the result as a comment per agent, plus inline comments on the
lines findings map to. A non-zero exit code fails the check, which is what a
verified critical or high finding produces.
