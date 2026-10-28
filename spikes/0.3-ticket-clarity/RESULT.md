# Spike 0.3: can a model tell whether a backlog item is clear enough to build and check?

**Promising, not yet proven.** With the model the app already uses (Ollama cloud,
`deepseek-v4.1-flash`), the light separates vague items from specific ones regardless of length,
and its *blocking guesses* are real questions an author would want to answer. Two things stand
between this and a feature: **a person's labels to measure it against** (the *Yours* column in
[`sheet.md`](sheet.md)), and **the light isn't steady**: run three times, about half the items
don't get the same light each time.

Run 2026-10-28 over this repository's items as each was first written (PM65).

```
node spikes/0.3-ticket-clarity/collect.ts            # out/items.json, from main's history
node spikes/0.3-ticket-clarity/run.ts --runs 3 --temperature 0   # out/results.json, out/sheet.md
node spikes/0.3-ticket-clarity/compare.ts            # once Yours is filled in sheet.md
```

## How it judges

The model isn't asked for a score. It does the builder's job and reports where it had to guess
([`clarity.ts`](clarity.ts)):

- **restatement**: what it would build, in two or three sentences;
- **checks**: how a reviewer would know it is done, each *concrete* (passes or fails without
  judgement) or not;
- **guesses**: what the item leaves it to make up, each *blocking* (another reasonable reading
  gives a different change, and nothing in the text favours one) or not;
- **why**: whether the item says why.

The light follows from those by a fixed rule, so it can be tuned without the model:

| Light | When |
| --- | --- |
| 🔴 red | two or more blocking guesses, or no concrete check |
| 🟠 amber | one blocking guess, fewer than half the checks concrete, or no reason on an item that needs one (anything but an XS or S bug or chore) |
| 🟢 green | otherwise |

Minor guesses are shown but don't count: the model lists two or three for almost any item, and
by definition any answer to them will do. Counting them turned every control amber or red.

The model gets a few sentences about the project, so that "the Board" isn't counted as a guess.

## What came out

64 items (59 from the history, 5 made-up controls), 3 runs each, 192 reviews, none unreadable.
About 1,150 tokens and 3 s a review.

**Controls**, each written to test one thing:

| | Item | Expected | Model |
| --- | --- | --- | --- |
| C1 | One line: `toggle_foo` on `/settings` to #00DD11 | green | 🟠🟠🟠 |
| C2 | A long paragraph that never settles what should change | red | 🔴🔴🔴 |
| C3 | "Login is broken sometimes." | red | 🔴🟠🔴 |
| C4 | A short feature with a reason, a URL and checks | green | 🟢🟢🟢 |
| C5 | "Dragging lags with 200 items. Make it smooth." | amber | 🟠🟢🟢 |

C1 is amber for a fair reason: "the colour" of a button doesn't say whether it means the
background, the text or the border. Length is not what decides the light: the long, vague C2 is
red and the one-line C1 nearly passes.

**This repository's items**, by the majority of the three runs:

| Light | Items | Rewritten afterwards (mean) | Rewritten 3+ times | Median length |
| --- | --- | --- | --- | --- |
| 🟢 green | 25 | 0.6 | 1 | 396 |
| 🟠 amber | 15 | 0.7 | 1 | 198 |
| 🔴 red | 19 | 2.8 | 7 | 255 |

*Rewritten* counts later changes to an item's text, notes written after building aside. It
isn't a verdict on the item, but it's the only record of how it went: of the 9 items rewritten 3
or more times (PM20 Multi-tenant 11, PM34 Mobile view 10, PM25 Batch edits 9…), 7 came out red.
The early one-liners (PM5, PM18, PM30, PM35, PM36) and the test items are red; the later items
written for agents (PM28, PM29, PM37, PM45, PM46, PM53) are green every time.

**The blocking guesses are worth reading** (the last column of `sheet.md`). Some of them:

- PM24: *"Where deleted items are surfaced … The item explicitly asks Nick and does not settle
  it."* The item did leave two questions open.
- PM44: *"Whether the email digest is opt-in per user, on by default, or configured per
  project."*
- PM41: *"The transport and endpoint shape of the MCP server (stdio vs HTTP) … are
  unspecified."*

Some are wrong for lack of context. PM56's *"What 'the admin area' is"* is answered by PM51, which
the model never saw.

## What a feature must change

- **Steadiness.** 34 of 64 items got the same light on all three runs; 4 got both green and red
  (PM33, PM34, PM54, PM56). Temperature 0 didn't fix it on Ollama cloud. Most changes are a single
  step (green and amber). Caching by the item's text (as PM3 does) stops the light changing on its
  own, but an edit could still change the light without making the item clearer. The options:
  take the majority of three runs (three times the tokens), or show the blocking guesses and keep
  the light in the background. Worth trying first: a stronger model, which may be steadier.
- **Context.** The model should see the project's other items' ids and titles and the spec's
  headings, so that references like PM51 or "the admin area" resolve. That costs tokens but
  removes a class of false guesses.
- **The restatement and the guesses are the product.** The light only summarises them. The item
  page should show both, with the checks, and offer to add the checks to the item.

## Not done here

- **A person's labels.** `sheet.md` has the model's lights; *Yours* is filled in only for the
  controls. With 20–30 labelled, `compare.ts` says how often the model agrees, which is what
  decides whether to build PM65.
- **Other models.** `--model` runs another one from the same provider; the Anthropic and OpenAI
  paths are the app's own `completer` and weren't run.
- **For: person and For: agent** are judged alike.
