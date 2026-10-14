# Fixtures

Test data for the core's tests: two made-up projects whose files follow `specs/conventions.md`,
written to exercise the cases real backlogs and plans produce.

| Path | What it exercises |
| ---- | ----------------- |
| `orchard/main/` | letter ids (`NW9`, `A1a`), `★`, job tags, every status, `Waiting:` and `Plan:` keys, a note before the first section, a `---` between sections, a `####` heading and a table inside bodies; a plan whose v2 table restarts numbering, so the later table wins, `built*` cells, and backlog/plan disagreements (NW7 against task 35, F9 against 26, C2 against 24) |
| `lantern/main/` | plan task numbers as ids (`2.6`, `5.8`), which link to their tasks; `Branch:` keys; a blocked `★` item (`9.1`); plan tables in several phases, bold status cells with notes, and a spike table with more columns |
| `lantern/feat-sketch-editor/PROGRESS.md` | a branch's copy of the plan with rows main doesn't have (3.7, 5.7–5.11) and a task further along than on main (2.6) |

They replace copies of real projects' files that were used while the parser was built.
