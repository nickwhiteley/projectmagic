# Project Magic

A web dashboard for projects whose backlogs are kept by AI agents in markdown in GitHub. It reads
`backlog.md`, `PROGRESS.md`, branches and pull requests across several repositories, and shows
what is planned, in flight and done, without asking an agent in each one.

- `spec.md` is the authoritative specification.
- `PROGRESS.md` is the build plan and its status.
- `backlog.md` holds what comes after v0.1.
- `specs/conventions.md` is the contract the agents in each tracked repository follow.

## Code

SvelteKit (Svelte 5, TypeScript) on Vercel. `src/lib/core/` is the pure core (parsing, linking,
status, splicing, access), with no I/O; `src/lib/server/` will hold GitHub, sync and the database;
`src/routes/` the pages and endpoints. `test/fixtures/` holds frozen copies of real files for the
core's tests, and `spikes/` phase 0's experiments.

- `make dev`: the dev server.
- `make test`: unit tests, type check and lint. `make test-e2e` runs Playwright.
- `make build`: a production build with the Vercel adapter.
