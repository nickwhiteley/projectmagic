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

## Setting up and deploying

Locally: copy `.env.example` to `.env` and fill it in (spec §11.3 says where each value comes
from), then `make migrate`, `make sync` and `make dev`, and sign in at http://localhost:5173.

To deploy on Vercel (task 4.7):

1. **Import** `nickwhiteley/projectmagic` as a new Vercel project. The framework is detected as
   SvelteKit and the Vercel adapter is already configured; leave the build settings as they are.
2. **Environment variables**, for Production and Preview: every variable in `.env.example`, with
   `GITHUB_APP_PRIVATE_KEY` holding the `.pem`'s contents (not `GITHUB_APP_PRIVATE_KEY_PATH`).
   Vercel sets `CRON_SECRET` itself once the cron in `vercel.json` exists; add it by hand if it
   doesn't. The database is the same Neon one; `make migrate` has already been run against it.
3. **Deploy.** Production is https://www.projectmagic.work (the bare domain redirects to `www`).
4. **The GitHub App** (GitHub → Settings → Developer settings → GitHub Apps → Project Magic):
   - add the callback URL `https://www.projectmagic.work/auth/github/callback`;
   - under *Webhook*, tick *Active* and set the URL to `https://www.projectmagic.work/api/github/webhook`,
     with the secret from `GITHUB_WEBHOOK_SECRET`.
5. **Check**: sign in at `https://www.projectmagic.work`; push to a tracked repository and see the
   overview's *synced* time change within a few seconds (the App's *Advanced* tab lists each
   webhook delivery and its response).
