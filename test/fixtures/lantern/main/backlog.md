# Backlog

A made-up project, Lantern: software for designing lamps, used as Project Magic's test fixture.
Items holding the reasoning for a `PROGRESS.md` task use the task's number as their id, so they
link to it; the rest have `LN` ids.

**The first line of every item is its meta line**: status, size, the branch its work is on and
what it waits on. The prose below it keeps the reasoning.

### Start here, 14 October 2026

The sketch editor is under way on `feat/sketch-editor`. The preview deployment waits on an
acceptance walk.

## Now — days

### 2.6 Accept the preview deployment — TRUST
**Status:** in progress · **Size:** S · **Waiting:** Nick's acceptance walk, and the record of the roles

The code is deployed. Not yet recorded: the walk (sign up, design a lamp, download its parts list)
and the database roles behind the pooler.

### LN1 Deal with the stray `.key` file — TRUST
**Status:** todo · **Size:** S

An untracked `.key` sits in the repository's root. Find what made it, then delete or ignore it.

### 7.7 Smaller prompts per step — COST
**Status:** todo · **Size:** S–M

A step's context carries the whole design; send only the parts it touches.

## The sketch editor

*Drawing a lamp freehand, then making it real.*

### 5.8 New sketch piece, and *Make sketch* — DESIGN
**Status:** todo · **Size:** S–M · **Branch:** `feat/sketch-editor`

**Sketch (blank)** starts an empty piece; *Make sketch* turns a template's piece into one.

### 5.7 The sketch part editor — DESIGN
**Status:** todo · **Size:** M · **Branch:** `feat/sketch-editor`

Add, duplicate, remove and edit sketched parts, with their sizes.

### 5.9 Joints between sketched parts — DESIGN
**Status:** todo · **Size:** M · **Branch:** `feat/sketch-editor`

### 5.10 Direct manipulation in the 3D view — DESIGN
**Status:** todo · **Size:** M–L · **Branch:** `feat/sketch-editor`

A move handle on the selected part, snapping to its neighbours.

### 3.7 Shaped parts — DESIGN
**Status:** todo · **Size:** L · **Branch:** `spec/shaped-parts-decided`

An outline of lines and arcs instead of a rectangle. **Decided:** outlines in, curves later.

### 5.11 The shape sketcher — DESIGN
**Status:** todo · **Size:** M–L · **Branch:** `feat/sketch-editor`

**Needs 3.7.** The interface for drawing an outline.

## Before launch

### 9.1 ★ The workshop — TRUST
**Status:** blocked · **Size:** M · **Waiting:** Nick's survey of the workshop (`PROGRESS.md`, *Prerequisites*)

Measure the real workshop and design its lamps end to end, as the first customer would.

### 8.5 Maintenance endpoints and erasure — TRUST
**Status:** todo · **Size:** M

### 8.6 Alerting and the support form — TRUST
**Status:** todo · **Size:** S–M

### 9.2 The production environment — LAUNCH
**Status:** todo · **Size:** M

## Later

### LN2 Comments pinned to a part — CLIENT
**Status:** todo · **Size:** M

### LN3 Photo-realistic images of a lamp in a room
**Status:** todo

### LN4 Voice control of the assistant
**Status:** todo
