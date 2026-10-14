# Backlog

**What is not built yet, in the order it should be built.** `spec.md` says what the product is;
`PROGRESS.md` holds the build plan. A made-up project, Orchard: software for planning small
gardens, used as Project Magic's test fixture.

Items carry a meta line (`specs/conventions.md`). The jobs are MONEY (it earns), PRO (a
professional needs it), DOOR (it brings people in) and TRUST (it keeps them).

### Start here, 1 October 2026

The billing work is built and waits on the bank. Everything under *Now* is either built and
waiting on a check, or under way. Read `PROGRESS.md` for what each task built.

## Now — days

*What is closest to done, and what is waiting on a person.*

### NW7 A renewal reminder every six months — MONEY
**Status:** built · **Size:** S–M · **Plan:** 35 · **Waiting:** the lawyer's confirmation of the notice period

Built 2026-09-30 (`PROGRESS.md` task 35). The terms promise an email at least 14 days before an
annual plan renews, naming the date, the amount and how to cancel.

- **Decided: every six months**, 21 days ahead, which leaves a week's leeway on the promised 14.
- **A step in the billing sweep**, not a job of its own. The send is remembered per payment, so a
  sweep that runs twice sends once.

### NW9 Export a plan to CSV — PRO
**Status:** built · **Size:** S–M · **Plan:** 46 · **Waiting:** the three sample files opened in a spreadsheet

Built 2026-10-02. Designers asked for the planting list in a form their suppliers take. The
export writes one row per plant with its quantity, size and position.

| Column   | From                     |
| -------- | ------------------------ |
| name     | the plant record         |
| quantity | the planting area's count |

### A1a ★ The whole of billing, against a stub provider — MONEY
**Status:** built · **Plan:** 21 · **Waiting:** the full lifecycle driven by hand on a preview deployment

Subscribe, upgrade, downgrade, cancel and refund, against a provider stub that behaves like the
real one. **Specced:** `specs/billing.md`.

### F9 Photographs at volume, phase 2 — DOOR
**Status:** in progress · **Plan:** 26

**Phase 1 is built (`PROGRESS.md` task 26); phase 2 is a run by hand.** Stage a photograph for
each plant from an open collection, review each with one yes or no, and publish what passes.

---

## To late October

*What has to land before the autumn planning season starts.*

### C2 ★ Make the pages good, not merely present — DOOR
**Status:** in progress · **Size:** L · **Plan:** 24

The plant pages exist (task 24) but read like a database. Lead with what a gardener asks: where
it grows, how big it gets, what it looks like through the year.

#### What good means

1. A first paragraph a person would write.
2. Photographs before tables.

### C3 ★ Pages for a situation that end at a tool — DOOR
**Status:** todo · **Size:** M

"Shady corner", "clay soil by a wall": a page per common situation, ending in a plan to start
from.

### E1 ★ Terms, privacy and cookie consent — TRUST
**Status:** blocked · **Size:** S · **Waiting:** the lawyer's read of the terms

Drafted in `docs/legal/`. Nothing goes live with payments until these do.

## Nov–Dec

*Professional features, then the paid plan.*

### A1b ★ The payment provider's adapter — MONEY
**Status:** blocked · **Size:** S · **Waiting:** the business bank account

The stub in A1a is replaced by the real provider, behind the same interface.

### B4 ★ A plant specification on the element — PRO
**Status:** done · **Size:** M · **Plan:** 10

Shipped; prune once the release notes mention it.

### B12 Element status: existing, retained, removed, proposed — PRO
**Status:** done · **Size:** S · **Plan:** 11

### NW2 Hide the plants, and print without them — PRO
**Status:** done · **Size:** S · **Plan:** 30

### NW3 Existing plants and new plants — PRO
**Status:** done · **Size:** S · **Plan:** 32

### NW4 A shopping list, with variety and price — PRO
**Status:** done · **Size:** M · **Plan:** 33

### E2 ★ End-to-end tests on the paths that now carry money — TRUST
**Status:** done · **Size:** M · **Plan:** 36

## Jan–May

*Bigger pieces for the next season.*

### B10 A survey underlay, an image with scale calibration — PRO
**Status:** todo · **Size:** M

A photograph or a scan of a survey, placed under the plan and scaled from two points.

### NW10 Buildings beyond the boundary: context, then shade — PRO
**Status:** done · **Size:** M, and M for the shade study · **Plan:** 49, 50, 52

Neighbouring buildings drawn as context, then the shade they cast through the day.

## Later

### BP3 Filtering the plant palette
**Status:** todo

Filter by size, season and soil while choosing plants.

### BP11 Suggestions for planting
**Status:** todo · **Plan:** 9

Suggest plants for an area from its situation, as a starting point the designer edits.
