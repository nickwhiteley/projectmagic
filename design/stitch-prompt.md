# Stitch prompts

Prompts for Google Stitch to design Project Magic's UI before phase 4. **Paste the base prompt
first, then each screen prompt in turn** in the same project, so the screens share one style.
The sample data is real, taken from orchard and lantern on 2026-10-14, so the
designs face real text lengths. `spec.md` §9 is the authority on what each screen contains.

---

## Base prompt

```
Design a desktop-first web app called Project Magic: a dashboard for a solo founder who runs
several software projects, each built by AI coding agents. The agents keep each project's
backlog and build plan as markdown files in GitHub, and this app reads those files and the
project's branches and pull requests to show what is planned, what is in flight and what is
done, without asking an agent.

The user is technical and reads a lot of dense text. It is a calm, editorial tool for reading
and deciding, not a busy enterprise tracker: generous line height, strong typographic hierarchy,
a serif for headings and long prose, a clean sans for UI, and a monospace for ids, branch names
and commit hashes. Restrained colour: neutral surfaces, with colour kept for status. Statuses are
todo (neutral), in progress (blue), blocked (amber), in review (violet), built (teal: merged,
waiting on a human acceptance check) and done (green). Each is a small pill with a label, never
colour alone. Provide light and dark themes. Use a left sidebar listing projects, a top bar with
search across all projects, a sync indicator ("synced 2 min ago") and the user's GitHub avatar.

Item ids such as NW9, A1a, FM3 or 5.8 are always shown in monospace before the title. A ★ marks
an item on the cut line. A job tag (MONEY, PRO, DOOR, TRUST, DESIGN, CLIENT, COST, LAUNCH) is a
small outlined label. Sizes are S, M, L or ranges like S–M.
```

## Screen 1: the overview

```
Screen: Overview, the home page. One large card per project in a two-column grid, for
"Orchard" (garden design software) and "Lantern" (furniture design software). Each
card shows:
- the project name, last activity ("last commit 3 h ago on feat/sketch-editor") and a health
  badge ("3 notices");
- a row of status counts: 2 in progress, 1 in review, 14 built, 2 blocked, 30 todo, and 4 done
  in the last 14 days;
- "In flight": a compact list of active branches, each with the linked item id and title, ahead
  and behind counts ("2 ahead · 0 behind"), PR state (open, draft or none) and the last commit
  message. Examples: feat/sketch-editor → 5.8 New sketch piece, and Make sketch;
  spec/shaped-parts-decided → 3.7 Shaped parts; vercel → unlinked (shown with a warning style,
  because it is work the backlog doesn't know about);
- "Plan": a progress bar for the current phase ("Phase 5: the editor UI · 6 of 11 done") and
  the next task ("Next: 5.8 New sketch piece, and Make sketch");
- "Waiting on you": up to three built or blocked items whose waiting reason names Nick, such as
  "NW9 DXF export · the three fixtures opened in AutoCAD LT, QCAD and Vectorworks".
```

## Screen 2: a project's backlog as a list

```
Screen: the Orchard project, List tab (the default). Tabs across the top: List, Board, Plan,
Done, Branches, Docs. The list shows the backlog in its written order, which is its priority, so
there is no sorting control. A collapsed "Preamble" panel at the top holds the file's opening
prose. Then sections as headings with their italic intro line: "Now — days", "To late October",
"Nov–Dec", "Jan–May", "Not this year", "Later". Each item is a row showing the status pill, id,
★, title, job tag and size. Under it, in muted text, is the status source ("built · plan task
46 · waiting on the three fixtures opened in CAD") or a branch ("in progress ·
feat/nw9-dxf-export · 3 ahead · 2 h ago"). Rows expand in place to show the item's rendered
markdown body. Notes (headings without ids, such as "Start here, 1 October 2026") are shown as
quieter prose blocks between rows. Filters for status, job and size sit at the top right, with
an "Add item" button. Example rows:
- [built] NW7 A renewal reminder every six months, MONEY, S–M, waiting on the lawyer
- [in progress] C2 ★ Make the pages good, not merely present, DOOR, L
- [blocked] A1b ★ The bank adapter, MONEY, S, waiting on the business bank account
- [todo] B10 Site survey underlay, an image with scale calibration, PRO, M
```

## Screen 3: the board

```
Screen: the same project, Board tab. Six columns: todo, in progress, blocked, in review, built
and done (the last 30 days). Horizontal swimlanes follow the backlog's sections ("Now — days",
"To late October", "Nov–Dec"…), each collapsible with a count. Cards are compact: id, ★, title
(two lines at most), job tag, size, and a one-line status source with a branch or PR icon.
Blocked and built cards show their waiting reason in amber or teal small text. A card with
pending edits in an open "Backlog edits" pull request has a small "pending" badge. Cards can be
dragged to reorder within a lane or between lanes, which reorders the markdown file. Status
can't be changed by dragging between columns, because status comes from the files.
```

## Screen 4: an item

```
Screen: an item page, "NW9 DXF export". A two-column layout. Left (wide): the title with id and
job tag, then the item's markdown body rendered beautifully with bullets, bold lead-ins, inline
code and tables, and an Edit button. Right (narrow) panel:
- Status: [built] with "since 2026-10-02 · plan task 46 says built";
- Waiting: "the three fixtures opened in AutoCAD LT, QCAD and Vectorworks";
- Meta: size S–M, job PRO, section "Nov–Dec";
- Linked: branches, PRs (#22 merged) and plan tasks (46 DXF export, built);
- History: "Edited by Nick 3 days ago · 4 commits touched this item".
Below the body, a "On branches" section shows a diff between main's version of this item and
feat/nw9-dxf-export's version, in red and green lines, as in a code review.
```

## Screen 5: editing an item

```
Screen: the edit view for an item, as a right-hand drawer over the List. Fields: id (monospace,
validated as unique, with a hint "next free: NW32"), title, job (select), size (select), status
(select: todo, in progress, blocked, in review, built, done), waiting (text, shown when blocked
or built), plan tasks (multi-select with numbers and titles), branch (text). Below them is a
markdown editor with a preview toggle for the body. The footer says where the edit goes: either
"Commits to main as you (nickwhiteley)" or "Adds to the open 'Backlog edits' PR #41, because
main is protected", with Cancel and Save buttons. Show a conflict state too: a banner saying
"This item changed on main since you opened it", with three choices: keep mine, take theirs,
or compare.
```

## Screen 6: the plan

```
Screen: the Plan tab for Lantern. The build plan is grouped into phases ("Phase 0:
spikes", "Phase 2: walking skeleton" … "Phase 9: launch"). Each phase has a header with a
progress bar ("8 of 8 done"), and phases that are completely done are collapsed. Each task is a
row with its number in monospace (2.6, 3.7, 5.8), the task text (long, wrapping to three lines
before "more"), a status pill, and the note after the status in muted text ("Neon and Vercel
accounts exist and the code is deployed…"). The task linked to a backlog item has a small link
chip to that item. A right rail lists "Disagreements": "9.1 backlog says blocked, plan says
todo".
```

## Screen 7: documents

```
Screen: the Docs tab. A left tree of documents (README.md, spec.md, notes.md, specs/ with
data-model.md, engine.md, ui.md, room.md…, spikes/0.1-postgres/RESULT.md), a branch picker
above it ("main ▾"), and a rendered markdown document in a comfortable reading column of about
72 characters, with a sticky table of contents on the right built from the headings. Item ids
and task numbers in the text ("see 5.8", "NW9") are subtle links with a hover card that shows
the item's title and status.
```

## Screen 8: delivery and quality

```
Screen: the Delivery tab for Orchard. Across the top is a row of four figures, each with a
small 12-week sparkline and a link "see the 11 deploys": production deploys this week (3),
median lead time from first commit to production (1.8 days), production bugs in the last four
weeks ("2 of 14 deploys", shown as a count, not a percentage), and median time to restore
(5 h). Below are weekly bar charts with a 4-week rolling line for throughput (items done,
weighted by size, with a toggle for plan tasks) and for main's CI (runs passed and failed, with
the hours main was red). No red or green thresholds: these are trends, not targets.
A prominent panel, "The founder queue: 14 items waiting on you", lists built and blocked items
oldest first, each with id, title, waiting reason and age ("NW7 A renewal reminder · the
lawyer's confirmation · 14 days"), so the owner can see their own bottleneck. Under it, a
table of production bugs: the fix PR, when it was raised, when the fix reached production, and
time to restore.
```
