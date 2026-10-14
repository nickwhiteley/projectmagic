# Spike 0.1: fetching a project's state in GraphQL

**Passed.** Everything `spec.md` §7.1 needs comes from **two GraphQL calls per repository**,
costing **2 points** of the 5,000-an-hour budget and taking **about 1.7 s** in sequence. After
the first sync, the second call fetches only blobs not already cached, which is usually none.
That leaves a webhook-driven sync at about 0.7 s and 1 point.

Run 2026-10-14 against `nickwhiteley/orchard` and `nickwhiteley/lantern` with a user
token (`gh auth token`). Rate limits and costs are the same with an installation token.

```
GITHUB_TOKEN=$(gh auth token) node spikes/0.1-graphql/fetch.mjs nickwhiteley/orchard nickwhiteley/lantern
```

| Repository     | Branches on GitHub | Active | Distinct blobs | Calls | Cost | Time    | Blob text |
| -------------- | ------------------ | ------ | -------------- | ----- | ---- | ------- | --------- |
| orchard     | 3                  | 3      | 2              | 2     | 2    | 1.81 s  | 414 KB    |
| lantern | 6                  | 5      | 5              | 2     | 2    | 1.64 s  | 340 KB    |

## The two calls

1. **Refs.** `refs(refPrefix: "refs/heads/", first: 100)`. For each branch it returns the head
   commit and date, `compare(headRef: <main>)` for ahead and behind, the last three associated
   PRs, and `file(path:) { oid }` for each tracked file. **Only oids are fetched here, never
   text**, so 100 branches carrying a 400 KB `PROGRESS.md` costs nothing extra. Paginate past
   100 branches.
2. **Blobs.** `object(oid:) { ... on Blob { text } }`, aliased and batched in 25s, for the oids
   on active branches that aren't in `blob_parse` yet.

## What the spec must change

- **`compare` goes on each ref node, with main as the head.** Its base is the branch, so the
  branch's own *ahead* is `behindBy` and its *behind* is `aheadBy`. It's easy to get the wrong
  way round. The real client wraps it once and tests it. A separate aliased-compare query (the
  first version of this spike) works too, but costs a call.
- **A missing file is an error, not a null.** `file(path:)` for a path that doesn't exist adds a
  `NOT_FOUND` entry to `errors`, with `data` still present. The client must treat that one
  error shape as "absent" and every other error as fatal.
- **Only pushed branches exist for the tool.** Locally, orchard has about 20 branches and
  lantern about 8, but almost all are merged and already deleted on GitHub. The
  exception is orchard's `sweep-stop-nil`: one commit that was never pushed, so it is
  invisible. **The conventions now ask agents to push a branch when they start work on it.**
- **A merged PR doesn't make a branch inactive.** Orchard's `product-notes-2` has three
  merged PRs and one more commit since. "Ahead of main and recent" is what counts, as §7.1 says.
