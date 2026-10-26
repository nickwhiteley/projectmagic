# Backlog

**What is not built and not yet planned.** `spec.md` describes v0.1, and `PROGRESS.md` holds its
build plan. Items here come after v0.1. They are written to `specs/conventions.md`, so Project
Magic can read its own backlog.

## After v0.1

### PM57 Initial signup action direction
**Status:** todo

Once I have signed up for a new tenant it is not clear what I have to do.  Add a call to action when the Github action has not been installed in the user's account.

### PM46 In Review gets the Accept button
**Status:** done · **Size:** S · **For:** agent

When an item is "Built" it gets a quick accept botton to mark it as Done.  Some AIs put things "In Review" once they have finished.  I would like the same Accept button when an item is in review as we have then it is built.

Built: an item in review, whether from an open PR or its meta line, gets Accept and Send back on
its page and under *Waiting on you*, and an in review item with a *Waiting* reason is listed
there. Accept marks it done on main, which counts over the open PR. Send back goes to the comment
box: the comment is posted on the item's open PRs, and an item whose meta line says in review
goes back to todo, as built and done items do.

### PM26 Hide Done
**Status:** done · **Size:** S · **For:** person.nickwhiteley

Hide Done items from the List view.

### PM27 Board drag changes status
**Status:** done · **Size:** S–M · **For:** person.nickwhiteley

When i drag an item on the Board view into a different status it should update the status as though I had used the Edit screen.  This is particularly important to move from built to done as they are all done by a person.
Looks like PM11 has similar ideas

Built with PM11, which asked for the same thing. Dropping a card into a column whose status can be set
(todo, blocked, built or done) is the same edit as saving the Edit form with that status. Moving
to `done` clears *Waiting*. Blocked and built ask what the item waits on when it has no reason
yet. In progress and in review can't be dropped into, and the Board says so. Reordering within a
column works as before, and is off while the For filter is on.

### PM17 A new item can 404 after Add, with nothing shown while it saves
**Status:** done · **Waiting:** Nick's check · **Size:** S · **Type:** bug · **For:** person.nickwhiteley

Reported by Nick on 2026-10-15. After **Add** on the add item screen nothing happens on screen for
several seconds, then the browser goes to the new item's page and it says 404. Opening the list
shows the item, so it was added. It happens only some of the time.

**The 404 is a race between the edit's sync and a webhook's.** An add commits to the
`projectmagic` branch, opens a PR and merges it, and each of those sends GitHub webhooks that
start a background sync. Then `edits.edit()` calls `syncNow()`. If a webhook's sync is already
running, `syncNow()` doesn't wait for it: it marks the project to sync again and returns
`'queued'` at once. The action redirects, the item page reads the cache from before the merge,
and the item isn't there yet. Whether a webhook gets in first is down to timing, hence
intermittent. GitHub's API can also return main's old head for a moment after a merge, which
fails the same way.

The fix:

- **After an edit, wait for a sync that includes the merge**: `syncNow()` gains a way to wait
  for the queued run to finish (polling `sync_started_at` until it clears, with a limit of about
  ten seconds), and the sync checks that main's head is the merge commit, retrying once if
  GitHub still returns the old one.
- **The item page doesn't 404 for an item just added**: if the item is missing but `edit_log`
  holds an add of that id in the last minute, show "Being added" and refresh, rather than an
  error.
- **The form shows that it is saving**: `use:enhance` with the button disabled and saying
  *Adding…* (*Saving…* on the edit screen) until the response, like PM13's navigation feedback.
- **A test** for `syncNow()` returning `'queued'` during an edit: the edit still waits until the
  item is in the state.

### PM24 Deleted items show as shipped
**Status:** done · **Waiting:** Nick's check · **Size:** S · **Type:** bug · **For:** person.nickwhiteley

Reported by Nick on 2026-10-15. An item deleted with **Remove → Delete it from the backlog now**
appears on the Done tab, the Board's shipped column and its own page as *shipped*. PM15, PM18
and PM23, all test items, show this way now.

Done detection (spec §7.3) treats every id that leaves main's backlog as shipped, because agents
prune shipped items without marking them done first. Project Magic's own delete looks the same
in the history.

**The fix:** Project Magic knows which removals were its deletes, because `edit_log` holds a
`remove` row for each (PM15 in #35, PM18 in #33 and PM23 in #41). An id whose removal matches one
is *deleted*:

- left off the Done tab's shipped list, the Board's shipped column and the overview's counts,
  and listed in a collapsed *Deleted* list at the bottom of the Done tab;
- its page says "Deleted on 15 Oct by @nickwhiteley", with its last text, not "shipped";
- its id still counts as used, so it is never suggested again.

A removal made outside Project Magic stays shipped, as now. It applies to past deletes too, since
the `edit_log` rows are there. Spec §7.3 and the Done view (§9) say so.

**Decided by Nick on 2026-10-15:** deleted items are listed in a collapsed *Deleted* list at
the bottom of the Done tab. A `dropped` status, for deletes made outside Project Magic, waits
until it is needed.

### PM25 Batch edits: save several changes as one commit
**Status:** done · **Branch:** `feat/pm25-batch-edits` · **Size:** M · **Type:** feature · **For:** person.nickwhiteley

Asked for by Nick on 2026-10-15. Every edit is its own commit, PR and squash merge on GitHub
(§10.2), which takes seconds and adds one commit to main per click. Several small changes in a
row, such as setting a few statuses or reordering the backlog, are slow and fill main with
`Backlog: edit …` commits.

An optional **batch mode**: edits are applied to a working copy of `backlog.md` held by Project
Magic, shown at once in the views as pending, and saved to GitHub together every few minutes or
on request. The save is one commit on the `projectmagic` branch and one PR, merged as today, so
main gets one commit for the batch.

- **A project setting** (`.projectmagic.yml`, next to `auto_merge`) and a per-user choice, off by
  default on (Nick's choice, 2026-10-16), so a project or a person can opt out and save each edit at once.
- **The pending edits are stored in Postgres**, per project, as the item edits themselves (id,
  operation, base `oid`), not as a whole file, so the batch can be replayed on the current
  backlog and a later edit by an agent doesn't conflict with it.
- **Save now** applies the pending edits in order to the current backlog on main in one commit.
  A scheduled save (a cron every few minutes, or after a quiet period) does the same.
- **Conflicts**: an edit whose item has changed on main since it was made is left pending and
  shown, with the others saved.
- **The views** show the pending edits on top of the cached state, marked as unsaved, with a
  count and a *Discard* for each.

**Decided with Nick (2026-10-16):** pending edits are kept in the database, per project (browser
local storage would be per user and invisible to the server and to agents). A batch is saved after
a quiet minute and at most five minutes after the first edit, triggered by page loads and webhooks,
with the page reloading itself when one is due, and the daily cron as the backstop. Built in
spec §10.5.

**Review fixes (2026-10-16):** an edit saved at once is built from main without anyone's pending
edits, so it can't carry them to main or hit a false conflict. A batch logs each edit under its
author, so the PR body, deleted detection and just-added checks see them. A page load saves a due
batch in the background instead of waiting for it. A pending edit can't be discarded while a save holds it.

### PM1 Epics
**Status:** done · **Size:** M · **Type:** feature · **For:** agent · **Epic:** EP1

Group items under an epic (`Epic: EP3`), declared in `backlog.md` or in `epics.md`. The views
are an epic roll-up across its items' statuses, and an epic filter on the Board and List.
`spec.md` §13.

Built for epics declared in `backlog.md` as an `### EP3 Title` item or a `## EP3 Title` section.
The Epics tab lists each epic with a bar by status, its items and the ones that shipped; the List
and the Board filter by epic (`?epic=EP3`); rows and cards show the id; a value that isn't an
epic id is flagged in the health panel. `epics.md` and the form's Epic field are PM28.

**Added by Nick on 2026-10-19**  As a user I do not know what the epic  ID should be so when I enter a name for the epic this should be taken as an implication that a new epic is being created.

Built on 2026-10-19: the Epic field on the add and edit forms takes an id (`EP3`) or a name. A name
that matches an existing epic's title (ignoring case) is that epic; any other name is a new epic,
numbered after the highest in use, declared as `### EP5 Name` in the epics file (made if it isn't
there; the `epics` key must not be `null`) and then written on the item as `Epic: EP5`. That is two
commits, the declaration first. With `auto_merge: false` the declaration waits in the edits PR, and
a second new epic made before it merges would get the same number.
Needs migration 014: `blob_parse`'s kind check never allowed `epics` (PM28), so any sync that found an
`epics.md` failed, which also made saves slow while the page waited for the sync. The admin screen for editing
an epic's description and target is not built.

### PM28 Epics: an `epics.md` file and an Epic field on the item form
**Status:** done · **Size:** S · **Type:** feature · **For:** person.nickwhiteley

What PM1 left out. `spec.md` §13 lets an epic be declared in its own `epics.md`, with a short
description and an optional target, so the sync fetches and caches that file and the Epics tab
shows the description and target. The add and edit forms get an *Epic* field that suggests the
declared epics, so a person can set it without editing the file.

Built: the `epics` key in `.projectmagic.yml` (default `epics.md`, `null` to not read one). Each
`###` or `##` heading `EP3 Title` in it declares an epic, the text under it is the description (as
markdown), and a `**Target:** …` line, or a `Target` key on a meta line, is the target. The sync
reads it from `main` only, and the Epics tab shows both. An epic declared in both files takes its
title from `backlog.md` and its description and target from `epics.md`; one declared only in
`epics.md` still appears. The add and edit forms have an *Epic* field with the declared epics as
suggestions; it accepts `EP` and a number, and clearing it removes the key.

### PM6 Edit `PROGRESS.md` status cells and docs
**Status:** done · **Size:** M · **Type:** feature · **For:** person.nickwhiteley

The item was a title only; this is what I took it to mean (`spec.md` §13). Say if it should be less
or more.

Built:

- **Plan status cells**: each task on the Plan page has an *Edit* (for editors) with the status
  and a note. It rewrites only that cell in `PROGRESS.md`: a bold word stays bold, the note after
  it stays unless changed, a pipe in a note is escaped, and a number repeated across tables edits
  the current row. If the cell changed on main since the page was shown, it is a conflict.
- **Documents**: a document on main has an *Edit* (`/p/<repo>/edit-doc/<path>`) with its text in a
  box, saved whole, as one commit. Only the project's `docs` files, at most 1 MB; files with
  Windows line endings keep them. A change on main since it was opened is a conflict, offering
  your text over the new version.
- Both go through the same path as backlog edits (the `projectmagic` branch, merged at once, the
  edit log, the pending-PR rules).
- **Not built**: a document editor with a preview, and creating or deleting documents or plan
  tasks.

### PM8 Mermaid in rendered docs
**Status:** done · **Size:** S · **Type:** feature · **For:** person.nickwhiteley

Built: a ```mermaid fence is drawn in the browser by Mermaid 11.17.2 with its strict security
level, loaded only on a page that has a diagram. A diagram with an error keeps its source and
says what is wrong. `npm audit` reports two low-severity advisories for Mermaid's KaTeX
dependency; the fix is Mermaid 12.2.0, released on 2026-10-13, which is worth taking once it has
aged.

### PM20 Tenants: one Project Magic for many teams
**Status:** done · **Size:** L · **Type:** feature · **For:** person.nickwhiteley

**Specced:** `specs/tenants.md` (2026-10-16). Four phases, one PR each: the tenant model and
scoping; sign-up and installations; members and access; tiers, quotas and billing. Nick answered
its questions on 2026-10-16 (its §15).

**Phase 1 (the tenant model and scoping) is merged** (#61); phase 2 (sign-up, installation claims and the admin screens) is merged (#62); phase 3 (members and access, with PM7) is merged (#63); phase 4 (tiers, quotas and billing) is built on `feat/pm20-tiers-billing`, so all four phases are in. See `specs/tenants.md` §14
for what each phase settled. 

**PM7 is folded in** as phase 3: invitations, the member list per project, changing a role and
disabling a user. PM7 asked whether full RBAC should come first, whether roles come from GitHub or
Project Magic, and whether plinth helps: fixed roles, not RBAC (§6.4); project roles from GitHub
permissions by default, managed in Project Magic as an option (§6.1, §6.2); plinth's designs, not its
code (§10).

Anyone could set up Project Magic for their own organisation and invite their colleagues,
without deploying their own copy. Today each deployment belongs to one person: the GitHub App's
credentials are environment variables, and every installation's repositories belong to it.

There are two ways to do it, and the choice decides most of the work:

- **One public GitHub App that any organisation installs.** Each installation becomes an
  organisation in Project Magic. Projects are already keyed by `installation_id`, so this mostly
  adds an `organisation` table, ties memberships and projects to it, and scopes every query and
  `can()` check to the signed-in user's organisations. No secrets are stored per organisation.
- **Each organisation registers its own GitHub App** and its id, private key and webhook secret
  are stored in the database, encrypted. More isolation, but every organisation does the App
  set-up from the README, and the app has to route webhooks and sign tokens per organisation.

The first draft put PM7's invitations before it. The spec reverses that: tenants come first, and
invitations are its phase 3.

**Questions for Nick:**

- **Hosted or self-hosted?** Is this a service you run for other people, or a self-hosted copy
  that serves several organisations? A hosted service brings billing, terms, privacy and support,
  and changes what the README promises ("it runs on your own accounts"). - Both options.  Primary is hosted with the Github login telling us what they have access to. The repo is still open source.
- **One App or one per organisation?** The first is much less work; is there a reason to need
  the second? - One app
- **Can a person belong to more than one organisation?** And who creates one: anyone who signs
  in, or only people you approve? - This would probably work but is not the intended approach.
- **Does single-owner self-hosting stay supported** as it is today? - Yes

Note that Organisation is a Github term so could be confusing particularly as one person could have access to multiple linked Github organisations.  Project Magic should call them tenants. Settings are at tenant level and there are tenant admins as well as Project Magic platform admins (me!).  Tenant signup must support payment as a stub, particularly for tiers with AI model access and large numbers of users.

This feature will need a full admin screen implementation.
Look at plinth for help

### PM34 Mobile view
**Status:** done · **Size:** S · **For:** person.nickwhiteley

The Project Magic site is cluttered on a mobile/small screen. Can elements be consolidated into lists?  Available projects in a dropdown, hide Activity so Overview, search, ask all appear next to the logo. Hide batch edits botton. List, Board, Plan, Done, Delivery, Branches, Docs as a dropdown list. Filters as an expanding list.

Body text box is too narrow (fixed by agent just now but not merged)

---

2026-10-18: This is still a problem, the issues are only visible towards the bottom of a mobile page as there is too much standard stuff at the top of the page.

I can also not see an easy way to go back to the issue list from an item's detail view

Second pass, 2026-10-19: on a phone the project header is smaller (no repository crumb, a 24px name,
a one-line sync), the "Batch edits are available" bar is hidden unless edits are unsaved, the
"in the file's order" hint is hidden, and the view dropdown sits closer, so the list starts higher.
An item's page has an **← All items** link above it, on every screen size. Not checked on a real phone.

Third pass, 2026-10-19: Feedback, the tenant (name or switcher), Tenant, Admin, Settings and Sign
out are in a user menu that opens from the name, on every screen size. The GitHub login and the
Inferred statuses switch are on the Settings page, not in the menu. On a phone
the view dropdown is narrow and shares a row with Filters and the Add buttons (shortened to
"+ item" and "+ bug"), and the drag hint is hidden. Not checked on a real phone.

Fourth pass, 2026-10-19: on a phone the project picker is half width with the user menu to its right,
which frees a line. The List's section headings are 20px, not 26px, and the gaps around the preamble
and between sections are tighter, on every screen size. Not checked on a real phone.

### PM35 Feedback button
**Status:** done

Add feedback smiley face buttons and feedback box like in Bloomprint. Perhaps add to plinth as it is  going to be used by several projects.

### PM33 Auto initialise a repo
**Status:** done · **Size:** M · **For:** person.nickwhiteley

Automatic creation of backlog.md, bug.md and project magic.yml when a new repo is added to the app.

Decided with Nick on 2026-10-17: the files are `backlog.md`, `bugs.md` and `.projectmagic.yml`. They
are added by a PR from `projectmagic` that is merged at once, and the install docs say so. Existing
files are never touched; a repo with a backlog gets only `.projectmagic.yml`. Every repo selected in
the App is set up, archived ones excepted and forks included. The templates are an empty backlog and
bugs file, and a config of commented-out defaults with `new_id_prefix` set to the repo's initials.
Needs migration 013. Spec §7.3a.

Added on 2026-10-19 at Nick's request, so that agents know how to use Project Magic: the config
links to the documentation, and a "Project Magic" section is added to `AGENTS.md` and `CLAUDE.md`
(created if missing).

### PM32 Information for agents
**Status:** done · **Size:** M · **For:** person.nickwhiteley

WHen a person writes a comment in a ticket/backlog item there needs a way for that to get to the working agent. Either as some sort of comment box or a flag to say to agents to review teh backlog item prose. Then next time the agent reviews the backlog it will know there is something to look at.

Decided with Nick on 2026-10-19:

- **The comment goes in the item's body**, as a dated paragraph signed with the person's login
  under a `#### Comments` heading, written like any other edit: a commit on the `projectmagic`
  branch whose PR is merged.
- **The flag is a meta key**, `**Comment:** <date>`, added with the comment. An agent working on
  the item reads the comments, acts on them and removes the key.
- **A comment on a `built` or `done` item sets it back to `todo`**, so it is active again.
- **`For:` is left as it is.** The person can change it on the form if they want to.
- **A comment on an item with an open PR is also posted on that PR**, so an agent working on the
  branch sees it without waiting to merge main.
- **Agents reply in the same place**, under `#### Comments`, and set `**Reply:** <date>`. An item
  with `Reply:` shows as *Waiting on you* on the overview until the person has read it, which
  removes the key.
- **The item page gets a *Comment* box**, separate from *Edit*, that adds the comment, the flag and
  any status change as one edit. It goes through batch edits like any other edit.
- **Bugs work the same way.** Plan tasks don't, for now.
- **`specs/conventions.md`, the `AGENTS.md` section (spec Appendix C) and spec.md** say what
  `Comment:` and `Reply:` mean and what an agent does with them.

Built on 2026-10-19. The item page has a **Comment for the agents** box under the body, and
**Mark read** above it when an agent has replied. A comment is its own kind of edit, applied to the
item as it is when saved, so it goes through batch edits without conflicting. Markdown in a comment
that could break out of the item (a heading, a rule, an unclosed code fence) is escaped. The overview
lists replied items first under *Waiting on you*. Tried on `projectmagic-testing` (PT2): a comment,
an agent's reply and *Mark read* all saved as expected. Posting on an open PR is not tried yet,
since that repository has no PR. New repositories get the rule in their `AGENTS.md` section; existing
ones need the bullet added from `specs/conventions.md`.

### PM36 Cross repo virtual backlog
**Status:** done · **Size:** L · **For:** person.nickwhiteley

Projects can affect multiple repos. Manage cross repo changes through a single board.

Decided with Nick on 2026-10-19:

- **The example**: a new person service, in a repository of its own, that changes Bloomprint,
  plinth and Furniture Magic, and perhaps data-api and the data warehouse. Each of them needs
  backlog items.
- **An epic is the container.** It is declared in the epics file of the repository that owns the
  change (here, the person service's). If they want, an admin can keep such epics in a repository
  of their own. Items in other repositories join it with `**Epic:** <repo>:EP<n>`.
- **Anyone can set it up**, an agent or a project manager, by writing the epic and the `Epic:`
  keys. Nothing is configured in Project Magic. A person sees links to items in repositories they
  can't open, and is refused if they follow one.
- **The epic's view shows every item linked to it, from every repository**, as the epic view does
  today, with the repository on each.
- **The epic's status is worked out from its items**: all done is done, any in progress is in
  progress, any blocked is blocked.
- **Adding from the epic adds the item to the chosen repository**, through that repository's edit
  path. If a repository refuses the edit, it says so; the others are not rolled back.
- **`<repo>:<id>` points at another repository's item**, in `Epic:`, `Waiting:` and PR bodies'
  `Backlog:` lines. An item that waits on another repository's item shows as blocked until that
  item is done.
- **Only within one tenant.**

Built on 2026-10-19:

- **`<repo>:<id>`** is read in `Epic:`, `Waiting:` and a PR body's `Backlog:` line. The repo is the
  project's address in Project Magic (`/p/<repo>`), and one naming its own repository is the bare id.
- **The owner's Epics tab** lists the other repositories' items in each epic, with their status and
  title, and shipped ones. The counts, the bar and a status worked out from all the items include
  them. An item in a repository the person can't open shows as `<repo>:<id>` with its status but no
  title, and its link is refused. Each epic links "Add an item to EPn in …" to the add page of each
  project the person can edit, with the Epic field filled in.
- **A taking-part repository's Epics tab** lists its items under "In other repositories’ epics". The
  Epic field suggests other repositories' epics, and the List and Board filter by them.
- **`Waiting: plinth:PL4`** shows the item as blocked, with a hint, until PL4 is done. The item page
  links each item it waits on, with its status.
- **An item's page** lists other repositories' PRs whose `Backlog:` names it, and their items that
  wait on it.
- Tried with `projectmagic-testing` PT2 set to `Epic: projectmagic:EP1 · Waiting: projectmagic:PM36`.
  It shows on Project Magic's Epics tab and on PM36's page, and PT2 shows as blocked.
- **Not built**: a PR in another repository doesn't change an item's status; it is only listed. The
  Board is still one repository's. The epic's view across repositories is the board for now.

### PM45 Assign when commenting
**Status:** done · **Size:** S–M · **Branch:** `feat/pm45-comment-assign` · **Type:** feature · **For:** person.nickwhiteley

From Nick's check of PM32 on 2026-10-21: adding a comment usually needs an assignment too, and
today that means a second trip through *Edit*.

- **A *For* dropdown beside the comment box**, saved with the comment as one edit. Its choices
  are the paths in use in the project (`assigneesInUse`), `agent`, `person`, and `person.<login>`
  for the project's members. It starts at the item's current `For:`, except when that is the
  commenter, when it starts at `agent`: a person commenting is usually handing work over.
- **Mentions in the text**: `@agent`, `@agent.claude`, `@nickwhiteley` (a login, meaning
  `person.nickwhiteley`). The first mention sets the dropdown as you type, so what will be saved
  is always on screen, and the person can still change it. An `@` that matches no member or
  agent path is left as text.
- **On the PR copy** (`commentOnPrs`), agent mentions are put in backticks so GitHub doesn't
  notify an account called `agent`. Mentions of people stay live, so GitHub notifies them.
- **The other way**: an agent replying under `#### Comments` sets `For:` to the person whose
  comment it answers, as well as `Reply:`. This goes into `specs/conventions.md`, the `AGENTS.md`
  section and spec.md beside PM32's rules.

Built: the select sits beside **Comment** and saves with it (unchanged, it leaves `For:` alone;
*anyone* removes it). Choices are the paths in use plus the tenant's active members. Mentions
inside code, and email addresses, are ignored. The agents' rule is in `specs/conventions.md`, the
scaffolded `AGENTS.md` section and spec.md §5, §10 and Appendix C.

### PM39 Waiting on you: evidence on each built item, and a daily Slack digest
**Status:** done · **Size:** M · **Type:** feature · **For:** person.nickwhiteley

From the critical review of 2026-10-21. The queue of built items is the most useful thing
Project Magic shows, but checking one still means opening GitHub and Vercel, and the queue only
works when someone remembers to open the page.

- **Evidence on each built item**, in the queue and on the item page: the PR's preview deployment
  URL, its CI result, the size of the diff, and the item's acceptance criteria when its body has
  them. None of these are read today.
- **Accept** and **Send back with a comment** (PM32) side by side, so a check is one decision.
- **A daily digest to Slack through an incoming webhook**: what is built, what is blocked on a
  person, and how long each has waited, with links to the items. The webhook URL is a tenant
  setting, stored encrypted; the daily cron posts it, and nothing is sent when nothing waits. A
  webhook posts to one channel and can't take replies, so Accept and Send back stay links to the
  item page. Follow-ons: PM43 (a Slack app with buttons) and PM44 (email).

Built: the delivery sync keeps each recent merged PR's evidence (diff from the PR, CI from Actions
runs on its head commit, the preview from GitHub deployments); built items show it with their
task-list count on the overview and the item page, beside **Accept** and **Send back** (a link to
the comment box). The webhook is set on *Tenant → Settings* (needs migration 015, `make migrate`),
with *Send now*; the daily cron posts after the sync. Found on the way: `vercel.json`'s ignore step
compared with `HEAD^`, so a code commit pushed together with a backlog commit got no preview; it now
compares with the branch's last deploy.

### PM40 Trust: catch stalled and drifting work
**Status:** done · **Size:** M · **Branch:** `feat/pm40-trust` · **Type:** feature · **For:** person.nickwhiteley

From the critical review of 2026-10-21. Derived status is only as good as the agents' habits,
and plan drift is a known failure of coding agents. Today a branch is stale only after 30 days
(`active_branch_days`), and disagreements sit in the collapsed health panel.

New notices, shown on the item's card and row, not only in the health panel:

- **Stalled**: in progress, and its branch has had no commit for a set time (24 hours by default,
  a `.projectmagic.yml` key).
- **Merged but not moved**: a PR naming the item is merged, but the item is still in progress or
  in review on main.
- **Done without a merge**: marked done, but no merged PR names it.

Each offers to post a PM32 comment asking the agent to put it right, rather than changing the
status itself: disagreements are shown, never resolved (§7.2).

Built: warning tags on the List and Board, and on the item page a notice with **Ask the agent**,
which fills the comment box (For: agent) for the person to edit and send. `stall_hours` is the new
config key. A merged PR counts when its branch names the item, or its `Backlog:` does and cites
five items or fewer (a backlog tidy citing 25 flagged Bloomprint's F9 and C2 until then). On
Bloomprint today: BP12 and BP14 merged but still in review; F9 and C2 in progress for 7 days
with no branch.

### PM49 Background failures are recorded, not only logged
**Status:** built · **Waiting:** Nick's check · **Size:** M · **Type:** feature · **Epic:** EP2 · **For:** person.nickwhiteley

Most work happens after the response, in `waitUntil` or the cron, and about 30 of its failures
are only `console.error` lines. A `job_run` table records each background task: its kind (sync,
project list, inference, Ask, digest, billing reconcile, tenant purge, delivery step, set up
repository, PR comment, pending save, GitHub roles refresh), its project or tenant, when it
started and ended, its outcome (`ok`, `failed`, `skipped`, `capped`) and the error. One helper,
`track(kind, scope, fn)`, wraps each place that now catches and logs, and still logs a JSON line
with the same id. No content goes in it, only ids, counts and error messages.

Places that swallow an error today: `delivery-sync.ts` (each step, and PR evidence), `sync.ts`
(setting up a repository, status changes), `inference.ts`, `ask.ts` (and its usage write),
`digest.ts`, `billing.ts` `reconcileAll`, `edits.ts` (`commentOnPrs`, `savePending`),
`project-state.ts` (pending edits), the roles refresh in `hooks.server.ts`, and the claim syncs
in `tenant/installations`. Also:

- **AI**: inference stops at the first failure and says nothing about the rest; a reply that
  `parseInference` can't read isn't counted; reaching the daily allowance is silent. Record each,
  with the call's latency and tokens.
- **Billing**: a reconcile failure, or a subscription the provider has no record of (skipped
  today), also goes in `audit_log` as `billing.reconcile_failed`, beside the tier changes already
  there.

Kept for 90 days, longer than the 14 days `webhook_delivery` keeps, so last month's evidence is
still there. Shown by PM51.

Built, with `report.ts` for the sync's own modules (they run from `scripts/sync.ts` too, where a report is a log line). Also recorded: `github access`, `edit catch-up`, `webhook`. Records are kept 90 days.

### PM47 The daily cron can fail without anyone knowing
**Status:** built · **Waiting:** Nick's check · **Size:** S · **Type:** bug · **Epic:** EP2 · **For:** person.nickwhiteley

The cron (`api/cron/sync`) is the backstop for missed webhooks, and three things hide its
failures. `syncNow()` returns `'ran'` when the sync failed (`runOnce` returns null, and
`sync-runner.ts` still reports `'ran'`), so the cron's result calls a failed project a success.
`syncAll()`, the pending-save loop and the `webhook_delivery` delete have no catch, so one throw
skips billing, the tenant purge and the digest with nothing recorded. And the result exists only
in the JSON returned to Vercel.

- `syncNow()` returns `'failed'` when the run failed, and `syncAll()` counts it.
- **Each step runs on its own** with its own catch, so a failure in one doesn't stop the rest.
- **A `cron_run` row** records each step's outcome, duration and counts: projects synced, failed,
  and deferred by the 40 second budget; edits saved; digests sent and failed.
- The Operations tab (PM51) shows the last run, red when there has been none for 26 hours (a
  removed `CRON_SECRET` or a Vercel plan change stops it silently), and lists projects deferred
  on three runs in a row, as the budget is then too small.

Built: each step runs on its own and is saved to `cron_run` as it ends, so a run that dies says how
far it got; `syncNow()` returns `failed`; a run with a failed step answers 500 for Vercel's log. A
failed project or digest is its own problem (PM50, PM54) rather than failing its step, so nothing is
reported twice. Suspended installations are skipped. *Run the cron now* is on the Operations tab.

### PM41 A read-only MCP server for agents
**Status:** todo · **Size:** M · **Type:** feature · **For:** agent

From the critical review of 2026-10-21, as a first answer to PM38. An agent working in one
repository can't see items in other repositories that it blocks or waits on (PM36's epics and
`<repo>:<id>` references); Project Magic can. Start read-only: an agent asks for an epic's items
across repositories, what an item waits on, or what is waiting on a person, answered from the
cache with the caller's permissions. Writes keep going through git, so the files stay the record;
whether to allow them is PM38's question.

### PM43 A Slack app: digest to each person, and Accept from Slack
**Status:** todo · **Size:** M–L · **Type:** feature · **For:** agent

Follows PM39's webhook digest. A Slack app installed per tenant by OAuth, with its bot token
stored encrypted, sends each person a direct message with what waits on them. Each built item
gets **Accept** and **Send back** buttons. Needs: a link between a Slack user and a Project Magic
user, and an interactivity endpoint that checks Slack's request signature. That endpoint makes
the edit with the person's own stored GitHub token, the same path as the Board. Distribution to
other workspaces is unlisted at first; a Slack Marketplace listing needs Slack's review.

### PM44 Email digest
**Status:** todo · **Size:** M · **Type:** feature · **For:** agent

Follows PM39, for people who don't use Slack. Project Magic doesn't know anyone's email address
today: the GitHub App needs the *Email addresses* account permission, and people re-authorise.
Then a sending provider (Resend or Postmark), SPF and DKIM on projectmagic.work, and an
unsubscribe link. Same content as PM39's digest.

### PM30 Alternate Git suppliers
**Status:** todo · **Size:** M–L

Such as BitBucket

### PM22 Make the item form explain itself, and add Type
**Status:** todo · **Size:** S · **Type:** feature · **For:** agent

Raised by Nick on 2026-10-15: the add item screen has no **Type**, and **Job** and **Plan tasks**
don't say what they are.

- **Type**: a select with `feature`, `bug` and `chore`, written as `**Type:**` on the meta line.
  The conventions already accept it; the form just never offered it. PM2 builds on it.
- **Job**: the area of the product an item belongs to, written as a trailing ` — WORD` on the
  heading (`### OR12 Invoices as PDF — MONEY`) and filterable on the List. Rename the field
  **Area**, or keep *Job* with a hint under it: "The part of the product this belongs to, such
  as MONEY. It is shown after the title."
- **Plan tasks**: the `PROGRESS.md` task numbers that build the item, written as `**Plan:**`.
  Add a hint ("Which tasks in the plan build this, such as 3.4") and hide the field when the
  project has no plan.
- **A one-line hint** under every field that isn't obvious, in the same words as
  `specs/conventions.md`.

**Question for Nick:** rename Job to Area everywhere (heading tag, filter, form), or only
explain it on the form?  - A rename is clearer I think

### PM12 A home page that explains Project Magic, and a README for strangers
**Status:** done · **Size:** M · **Type:** feature · **For:** person.nickwhiteley

- **`/` for a signed-out visitor** is a home page instead of a redirect to sign in: what Project
  Magic is (a dashboard over backlogs, plans, branches and PRs that AI agents keep in markdown in
  GitHub), why it helps (see every project's state without asking an agent in each repository;
  what is waiting on you; edits that land on main as ordinary commits), and the setup at a high
  level, linking to the README for the detail. Signed in, `/` stays the overview. In the look of
  `design/README.md`, with an example built from made-up data.
- **The README** is written for a stranger: what it is and who it is for, an image, how it works,
  the conventions, setting up the GitHub App, the database and the environment, running locally,
  deploying, adding a repository, developing, and where things are. MIT licence.
- **The current files hold nothing private**: the fixtures are two made-up projects (Orchard and
  Lantern), the Stitch exports are gone, and the real projects' names and details are replaced.
  The history still holds them; that is PM14.

### PM14 Make the repository public
**Status:** done · **Size:** M · **Type:** chore · **For:** person.nickwhiteley

Nick has decided to keep the repository private for now (2026-10-14). The current files are
clean (PM12), but the history and GitHub still hold two private projects' backlogs and plans:

- **The git history**: every earlier commit has the old fixtures, golden files and Stitch exports,
  and the projects' names and details in the spec, the plan and the tests. A rewrite removes the
  paths and applies the same replacement map PM12 used, so the real names become Orchard and
  Lantern.
- **GitHub's pull requests**: closed and merged PRs keep their descriptions, their diffs and the
  commits behind them, which a force-push doesn't reach. PR #6's diff holds both backlogs in full,
  and many descriptions quote them. Only deleting the repository removes them.

So going public is one of: delete the repository and push the rewritten history to a new one with
the same name (losing the PR history; the GitHub App is reinstalled and Vercel reconnected, since
the repository's id changes), or keep this one private as the full record and publish the
rewritten history as a new repository under another name. Nick chooses when the time comes.

### PM2 Bug items
**Status:** done · **Size:** S · **Type:** feature · **For:** person.nickwhiteley

`Type: bug` on an item, with `Found:` and `Raised:`, and an optional `bugs.md` as a second
backlog file with a `BUG` prefix. The board gains a type filter and a bug lane. `spec.md` §13
and §16.4. PM9 measures the bugs that PRs fix; this shows the ones still open.

Built: `Type:` (any value; `bug` gets a red tag), `Found:` and `Raised:` show on the item page, and
the List and the Board filter by Type when the project uses it. **Left for PM29:** the optional
`bugs.md` second backlog file with a `BUG` prefix, and a separate bug lane on the Board (the Type
filter covers showing only bugs).

**Fix (2026-10-16):** the List has an *Add bug* button. The form was only reachable from *Add item*, and
only when a `bugs.md` existed. With none, the bug is added to the backlog with `Type: bug`.

### PM29 Bugs: a `bugs.md` file and a bug lane on the Board
**Status:** done · **Size:** M · **Type:** feature · **For:** person.nickwhiteley

What PM2 left out. `spec.md` §13 and §16.4 let bugs live in an optional `bugs.md`, configured as
a second backlog file with a `BUG` prefix, so the sync fetches and caches it, ids come from the
prefix, and the views read two backlogs. The Board gets a bug lane beside the section lanes.

Built: the `bugs` key in `.projectmagic.yml` (default `bugs.md`, `null` to not read one) and
`bug_prefix` (default `BUG`). The sync fetches and caches the file on every branch, and the state
merges its items after the main backlog's, in a *Bugs* section (the Board's bug lane), each marked
with its file. An item there with no `Type` counts as a bug. Edits, status changes, removals and
moves go back to the file the item is in; a move can't cross files. *Add a bug* (`/new?bug=1`)
starts a bug with the `BUG` prefix in `bugs.md`, after its last bug. Done detection reads both
files as one list, so a bug removed from `bugs.md` shipped. An id in both files is shown once and
flagged. **Not built:** a project's first `bugs.md` has to be created in the repository; the add
form only adds to a file that exists.

### PM3 Inferred status for items with no meta line
**Status:** done · **Size:** M · **Type:** feature · **For:** person.nickwhiteley

A model reads the prose and proposes a status and waiting reason. It is cached by blob `oid` and
shown as *inferred*.


Model is selectable (OpenAI, Anthropic, Ollama) but initially uses Ollama models.
Limits on token usage per tenant (see PM20) or designed with tenant in mind. Users and tenants can opt out.

Built (PM3 answers).

- **Model**: chosen by environment, `INFERENCE_PROVIDER` of `ollama`, `openai` or `anthropic`,
  with `INFERENCE_MODEL`, `INFERENCE_BASE_URL` (Ollama) or `INFERENCE_API_KEY`. Unset, it is off.
  Ollama is the first target; it must be reachable from where the app runs, so a hosted app needs
  an Ollama on a public address, or one of the other providers.
- **What it does**: after a sync, a few items (5 at most) with no meta line and no current
  proposal are sent to the model, which answers with a status and a waiting reason. The proposal
  is cached in `item_inference` against the item's text and is dropped when the item changes. It
  shows as *inferred* on rows and the item page, and never changes the derived status.
- **Limits**: `INFERENCE_DAILY_TOKEN_LIMIT` tokens a day, default 50 000, counted by scope
  (`project:<id>` now). **Left for PM20:** a `tenant:<id>` scope and per-tenant limits, which need
  tenants to exist.
- **Opt out**: a project with `inference: false` in `.projectmagic.yml` is never sent, standing in
  for the tenant opt-out until PM20; a person can hide the proposals from their own views with the
  *Inferred statuses* button in the header (shown only when a model is configured).
- **Before deploying**: `make migrate` creates `item_inference`, `inference_usage` and
  `user_pref` (`migrations/003_inference.sql`). The app copes with the tables missing, and shows
  no proposals until they exist.

### PM4 Ask across projects
**Status:** done · **Size:** M · **Type:** feature · **For:** person.nickwhiteley

A question box answered from the cached parses.

Built as the *Ask* page, shown in the navigation when a model is configured (PM3's `INFERENCE_*`
variables). The page sends the question with a digest of every project you can see: each item's
id, status, title, what it waits on, who it is for, epic, type, size, branches and PRs, and what
shipped in the last 30 days. The digest is about 28 000 characters, split evenly between projects,
and says when items were left out. The model is told to use only the digest and to cite items as
`[repo:ID]`; a citation becomes a link only if that item is in the digest, so an invented or
injected link is dead text.

- **Cost**: counted per person against `INFERENCE_DAILY_TOKEN_LIMIT`, in `inference_usage` under
  `ask:<user>`. Needs PM3's migration (`make migrate`).
- **Opt out**: a project with `inference: false` is left out of the digest, and a person who hid
  AI features can't ask.
- **Not in it**: no memory between questions, and no search of item bodies, which the digest
  leaves out to stay small. A body-level question would need retrieval first.
### PM5 Activity feed
**Status:** done · **Size:** S · **Type:** feature · **For:** person.nickwhiteley

Recent commits across every project, grouped by linked item.

Built as the *Activity* page in the navigation: the last 14 days across every project you can
see, grouped by the item each was about. Each active branch shows its latest commit, since the
sync caches only a branch's head, and an item that shipped shows once, with its PR. Branches that
no item links to are listed under "not linked to an item". Project Magic's own edits and
deployment branches are left out. A full commit history would need the sync to cache commits.

### PM21 Images in rendered docs
**Status:** done · **Size:** S · **Type:** feature · **For:** person.nickwhiteley

The Docs tab shows a document's images as broken: `render.ts` resolves a relative `src` to the
docs view, as it does for links, and GitHub's raw URLs need a token for a private repository.
Serve an image from the branch's tree through the app, with the installation token and the
project's view permission, cached by blob oid like `doc_blob`. SVG goes out as an image with a
restrictive `Content-Security-Policy`, never inline, since a branch can hold anything an agent
wrote. `docs/architecture.md` is the first document that needs it.

Built: `/p/<repo>/raw/<path>` serves an image from a branch's tree through the GitHub contents
API with the installation token, for png, jpg, gif, webp and svg up to 1 MB, with the project's
view permission. An SVG is sent with `Content-Security-Policy: default-src 'none'; sandbox`, so
it can't run script. The browser caches an image for 5 minutes and revalidates by blob sha; the
Postgres cache the item suggested isn't needed for that.

### PM19 An Edit button in the expanded list row
**Status:** todo · **Size:** S · **Type:** feature · **For:** person.nickwhiteley

On the List, a row opens to show the item's detail, but editing means opening the item's page
first. Add an **Edit** button at the bottom of the open row, going to `/p/<repo>/i/<id>/edit`,
shown only to people who can edit the project.

**Question for Nick:** should the Board's cards get the same button?

### PM9 Delivery and quality
**Status:** done · **Size:** M · **Type:** feature · **For:** person.nickwhiteley

DORA's four measures sized for one person and a team of agents: deployment frequency, lead time
for changes, change failure rate and time to restore, from Vercel's GitHub deployments and
`Bug: production` PRs. Plus size-weighted throughput, item lead and cycle time, main's CI health,
and **the founder queue**: the built and blocked items waiting on the owner, and how long each
has waited. A line on each overview card, and a Delivery tab. `spec.md` §16.

The `Bug:` PR convention went into orchard#35 and lantern#70 on 2026-10-14, so
production bugs are labelled from now on. Earlier `fix/` PRs aren't labelled and are counted as
fixes, not production bugs.

Built (`spec.md` §16.7 says how it differs from the plan):

- **Data**: migration `004_events.sql` adds an `event` table (production deploys, merged PRs, CI
  runs on main, status changes). The sync reads them from GitHub incrementally and never fails
  because of them. Without the migration everything works and the tab is empty. It also restarts
  the backlog history walk so every past status change is recorded.
- **Figures** (pure functions, tested): deploys a week (edit deploys left out), lead time, change
  failure, time to restore, size-weighted throughput, item lead and cycle time, the founder queue
  with ages, and main's CI where a run that never started is not a failure. Counts stay counts
  until a denominator reaches 10; no thresholds; weekly bars with a 4-week rolling line.
- **Where**: a *Delivery* tab per project, and a line on each overview card (deploys this week,
  lead time, production bugs in 4 weeks, the queue), each linking to the tab.
- Tried against the real GitHub API for this repository (12 production deploys, 3 of them edits)
  and plinth (CI runs and PRs).
- **Not built**: plan tasks a week, ancestry matching for deploys, per-project thresholds.

### PM10 Accept a built item from the founder queue
**Status:** done · **Size:** S · **Type:** feature · **For:** person.nickwhiteley

From Stitch’s *Awaiting Human Check* screen: an **Accept**
button on each built item in the founder queue (and on the item page) that marks it done. It is
an ordinary edit (§10): the meta line's status becomes `done`, through the `projectmagic`
branch, so it needs phase 5's write path. It turns the queue from something to read into
something to clear.

Built: an **Accept** button on each built item in the Overview's *Waiting on you* list and on
the item page, for people who can edit. It is the Board's status edit with `done`, so *Waiting*
is cleared, and it returns to where it came from.

### PM11 Set an item's status by dropping it into a Board column
**Status:** done · **Size:** S · **Type:** feature · **For:** person.nickwhiteley

Dropping a card into another column on the Board only reorders it today (task 5.3). Make a drop
into **todo**, **blocked**, **built** or **done** also set `Status:` in the item's meta line, as an
ordinary edit through the `projectmagic` branch (§10). **in progress** and **in review** come from
branches and PRs (§7.2), so a drop there still only reorders, and the Board should say so. A drop
into blocked or built should ask for the *Waiting* reason. Asked for by Nick on 2026-10-14, after
dragging E5 expecting its status to change.

Built with PM27.

### PM13 Show that a navigation is under way
**Status:** done · **Size:** S · **Type:** feature · **For:** person.nickwhiteley

Straight after PM12. Clicking a project in the left navigation can take seconds before anything
changes, so people click again and again. Show at once that something is happening: the clicked
link marked as current and busy, and a thin progress bar at the top while SvelteKit navigates
(`navigating` from `$app/state`), as on every navigation. Then find out why it is slow, rather
than only hiding it: a project page reads the cached state from Postgres and should not call
GitHub on the way, so measure the load on Vercel (cold starts, Neon's connection, building the
project's state) and fix what dominates.

### PM16 Assign items to a person or an agent, and filter by it
**Status:** done · **Size:** M · **Type:** feature · **For:** person.nickwhiteley

So Nick can see what to work on, and agents can see what is theirs. Answers from Nick on
2026-10-15.

**The assignment is a meta key, `For:`, in `backlog.md`**, where agents read it too:

    **Status:** todo · **Size:** S · **For:** person.nickwhiteley

- **The value is a dotted path**, free text whose first part is `person` or `agent`:
  `person` (any person), `person.nickwhiteley` (a GitHub login), `agent` (any agent),
  `agent.claude` (any Anthropic agent), `agent.claude.opus` (one model family). Anything else is
  kept, shown, and flagged in the health panel.
- **Agents name themselves `agent.<maker>.<family>`**, worked out from their own model, with no
  version: Claude Opus 5.5 is `agent.claude.opus`. A version would add dots, and dots are levels.
- **One value per item.** The hierarchy covers "any of these".
- **No `For:` means anyone's.**

**What matches what.** An item belongs to everyone its path covers, and to everyone below that:

- A filter shows items for that path or below it, items for a more general path above it, and
  unassigned ones. Nick's "mine" (`person.nickwhiteley`) is items for `person.nickwhiteley`,
  for `person`, and for no one.
- So an agent running as `agent.claude.opus` may take items for `agent.claude.opus`,
  `agent.claude`, `agent` or no one, and not `agent.claude.sonnet` or anything for a person.

**What it adds:**

- **The parser** reads `For:` (no change to status derivation), and checks its first part.
- **The List and the Board** get a *For* filter: *Mine*, *People*, *Agents*, and each value in
  use, mirrored in the URL like the List's other filters. The value shows on rows and cards.
- **The add and edit forms** get a *For* field, suggesting the values in use, empty by default.
- **`specs/conventions.md`**, for agents:
  - work only on items for you, for a path above you, or for no one;
  - you may hand an item to a person, such as one you are blocked on, by setting `For:` to
    them;
  - take an item assigned to a person only when that person says so, and then set `For:` to
    yourself;
  - when you set an item to `built` and it needs a person to check it, set `For:` to that
    person (`person`, or `person.<login>` when you know who).
- **`spec.md`** §5.1 (the key) and §9 (the filter).

### PM37 Branch switcher
**Status:** todo · **For:** agent

Add a branch switcher so a user can make changes and see items and bugs on a branch. It will reply on the branch being pushed to Github.

### PM38 MCP server or API
**Status:** todo · **For:** agent

Should we have an MCP server or API so that agents can make changes to the *main* version of the backlog?
It degrades the imperative to keep all code and project dics completely aligned but for future tasks or discussions it may be beneficial.
Discuss this.

### PM42 Read other task formats
**Status:** todo · **Size:** L · **Type:** feature · **For:** agent

From the critical review of 2026-10-21. Low priority: it widens the market, not Nick's own use.
Read a Backlog.md folder, Spec Kit or Kiro `tasks.md`, and GitHub Issues into the same status
engine, so a team sees value before adopting the conventions. Inferred status (PM3) is the
starting point for a repository with none.

### PM48 Errors get a reference, a record and a page
**Status:** built · **Waiting:** Nick's check · **Size:** M · **Type:** feature · **Epic:** EP2 · **For:** person.nickwhiteley

An unexpected error in a request is a bare 500 today, recorded only in Vercel's logs, and the
person who hit it can't say which one it was. There is no `handleError` hook and no
`+error.svelte`.

- **A `handleError` hook** writes each one to an `app_error` table: a short reference, the route
  id (not the URL, which can name items), method, status, message, stack, user, tenant, project,
  the deployed commit (PM56) and the time. It also logs one JSON line with the same reference, so
  a log search can still find it.
- **A `+error.svelte` page** says what happened in plain words, shows the reference, and offers
  the Feedback button (PM35) with the reference and page already filled in.
- **Errors in the browser too**: `window.onerror` and `unhandledrejection` post to a small
  endpoint, rate limited per user, into the same table marked `client`.
- **Grouped by fingerprint** (route and the message with ids stripped), with first seen, last
  seen and a count, so one bug that happens a thousand times is one row.

Kept for 90 days. Shown by PM51.

Built as written. Only SvelteKit's *unknown* errors are recorded: `error(403, …)` and 404s aren't faults. The Operations tab finds an error by the reference a person quotes.

### PM50 Sync history, and how long a project has been failing
**Status:** built · **Waiting:** Nick's check · **Size:** M · **Type:** feature · **Epic:** EP2 · **For:** person.nickwhiteley

`project.last_error` is one string that the next good sync clears, so a project that fails every
other sync looks healthy half the time, and nobody can tell when it started.

- **Each sync run is a `job_run` row** (PM49) with what started it (webhook, cron, edit, page
  load, claim), how long it took, its GitHub calls, the files it parsed, and whether it ran again
  for a request that came in meanwhile.
- **The project keeps `failing_since` and a count of failures in a row**, so the banner says
  "Sync has failed 6 times since Tuesday 09:14: …" rather than only the last message.
- **A sync left running** (older than `STUCK_MS`, which another may then replace) is recorded as
  `stuck`, and shown as stuck until then, rather than the project quietly waiting five minutes.
- **An edit whose sync didn't catch up** (`syncUntil` returning false, ignored at both calls in
  `edits.ts`) is recorded, and the person is told the view may be a few seconds behind rather
  than meeting the PM17 404.
- **The project's Health panel gets a Sync section**: the last ten runs with outcome and
  duration, and when the last webhook arrived (PM52).

Built: the history opens from *synced … ago* in each project's header rather than the Health panel,
which is about the backlog's data; the Operations tab's project page has the full list.

### PM51 An Operations tab for platform admins
**Status:** built · **Waiting:** Nick's check · **Size:** M–L · **Type:** feature · **Epic:** EP2 · **For:** person.nickwhiteley

The one place a support engineer looks first. The admin overview counts tenants and nothing
else today. `/admin/ops`, metadata only, each line linking to the tenant or project and to its
records:

- **Now**: the deployed commit and the health check (PM56): database latency, migrations, what is
  configured; and the last cron run (PM47).
- **Needs attention**: projects whose sync is failing (PM50) or stuck; projects with no webhook
  for a day while the cron finds new commits (PM52); pending edits claimed for over ten minutes,
  in conflict, or held because their author must sign in again (PM54); suspended or unclaimed
  installations and ones whose token GitHub refuses; tenants whose digest is failing; GitHub
  budgets running low (PM53).
- **Errors** (PM48), grouped, newest first, with counts for the last hour, day and week.
- **Background work** (PM49) by kind: runs, failures and the slowest, last 24 hours.
- **AI**: calls, failures, unreadable replies and tokens against each tenant's allowance, today.

The admin overview gets a line above its counts, "3 things need attention", linking here, and the
tenant page (`/admin/tenants/[id]`) shows the same lists for that tenant.

Built, with fixes: *Sync now*, *Clear and sync*, *Release*, *Send it again*, *Run the cron now*, *Resolve*, *Check again* (a token), *List installations again* and *Check now* (alerts), each audited as `platform.ops.<action>`. A project on an installation whose token is refused is listed once, under the installation.

### PM52 Webhook deliveries say what happened to them
**Status:** built · **Waiting:** Nick's check · **Size:** S · **Type:** feature · **Epic:** EP2 · **For:** person.nickwhiteley

`webhook_delivery` records that a delivery arrived, not what came of it. Add its outcome (sync
started, duplicate, ignored and why, failed and the error), how long it took, and the sync run it
started (PM50).

- **A missed webhook is counted** when the cron's sync finds new commits on main that no delivery
  announced, so a broken webhook (a changed secret, a disabled App hook) shows up the next
  morning, not when someone notices stale data.
- **Bad signatures are counted**, as they usually mean a misconfigured secret.
- **A delivery for a repository with no project** is counted, not just answered "ignored".
- **A body that isn't JSON** gets a 400 and a record, rather than an unhandled 500.

Shown by PM51, with the last delivery per project on its Health panel.

Built as written. A missed webhook is counted when a cron sync finds main moved and no delivery came since the last sync.

### PM53 GitHub calls: timeouts, retries and the API budget
**Status:** built · **Waiting:** Nick's check · **Size:** S–M · **Type:** feature · **Epic:** EP2 · **For:** person.nickwhiteley

`github-client.ts` has no timeout on any call (the model client has one, `models.ts`), never reads
GitHub's rate-limit headers, and fails the whole sync on one 5xx. A hung call holds the project's
sync claim until the function dies, and a sync asked for meanwhile is lost.

- **A timeout on every call** (`AbortSignal.timeout`), recorded as such.
- **Retry** a 5xx, or a 403/429 with `retry-after`, a couple of times with backoff inside the
  function's time.
- **Read `x-ratelimit-remaining`, `-limit`, `-reset` and `-resource`** on each response and keep
  the latest per installation and per user token. A sync that fails on the limit is recorded as
  `rate limited` with when it resets, not as a raw GraphQL error.
- **An installation token GitHub refuses** (401, 403 or 404 on `access_tokens`) is recorded on
  the installation, not only as the project's sync error.

PM51 shows each installation's remaining budget and warns below 20%.

Built: a 30 second timeout; reads (GET and GraphQL) retried twice; budgets written at most every 30
seconds per token, at once when under 20%; a refused token cleared by the next good sync or *Check
again*.

### PM54 Tenants see their own integration health
**Status:** built · **Waiting:** Nick's check · **Size:** M · **Type:** feature · **Epic:** EP2 · **For:** person.nickwhiteley

Much of what goes wrong is put right by the tenant, not support, if they are told. A *Health*
section on the tenant's settings lists, for its own projects, each problem and what to do:

- **An installation suspended**, or a repository the App can no longer read.
- **A Slack digest failing**: add `digest_last_error` and `digest_failed_at` beside
  `digest_sent_on`, shown on the Slack settings too, so a revoked webhook isn't missed for weeks.
- **A member whose GitHub sign-in has expired**, and whose batched edits are therefore held.
  Today a background save that meets `ReauthRequired` is deliberately silent, and
  `user-token.ts` turns every refresh failure, a network error or a GitHub 5xx included, into
  `ReauthRequired`. Store the real reason, retry the ones that aren't an expired token, and show
  "edits held: <login> must sign in again" on the project.
- **Projects paused by the plan** (`over_limit`), which drop out of lists and syncing today with no
  sign: a banner "2 projects are paused by your plan", and an `audit_log` row when it happens.

**Failed edits**, which `edit_log.error` records and nothing reads, are listed on the project's
Activity and on the item's page ("Your edit of PM12 at 10:41 failed: GitHub said 409"), so a
person isn't left wondering whether their change was saved.

Built: the Health section is on the tenant's Overview (`/tenant`), the digest's failure also on its
Slack settings, and held edits are named on the project's pages too.

### PM55 Tell support when something breaks
**Status:** built · **Waiting:** Nick's check · **Size:** S–M · **Type:** feature · **Epic:** EP2 · **For:** person.nickwhiteley

Nothing above helps if nobody opens the screen. A platform setting holds a Slack webhook (stored
encrypted, sent with the digest's code) and/or an email address for alerts. A check, run by the
cron and after each failed background run, sends one message when a condition starts and one when
it clears, never one per failure:

- a new error fingerprint (PM48);
- a project failing sync for an hour (PM50);
- no cron run for 26 hours, or a cron step failing (PM47);
- no webhooks at all for six hours (PM52);
- a GitHub budget below 10% (PM53);
- migrations behind the code (PM56);
- a tenant's digest failing two days running.

Each message links to the record in PM51. A daily summary, sent after the cron, says all is well
when it is, so silence isn't mistaken for health.

Built for Slack only: email waits for a sender (PM44). "No webhooks at all for six hours" became *missing webhooks* (PM52), as a quiet night isn't a fault. Alerts are set and tested under *Admin → Settings → Alerts*; conditions are tracked with no webhook set, so the Operations tab shows what is open.

### PM56 A health check, migration drift and the deployed version
**Status:** built · **Waiting:** Nick's check · **Size:** S · **Type:** feature · **Epic:** EP2 · **For:** person.nickwhiteley

Seven places treat a missing table or column (`42P01`, `42703`) as "no data": `sync.ts`,
`digest.ts`, `delivery-sync.ts`, `project-state.ts`, `batch.ts` and `delivery.ts`. That suits the
moment between a deploy and its migration, but a deploy whose `npm run migrate` never ran just
loses features quietly.

- **`/api/health`** answers 200 or 503, for an outside uptime check, with: the database reachable
  and its latency; the newest migration applied against the newest in `migrations/`; the required
  environment set; and the cron's last run (PM47). No secrets and no tenant data.
- **Migration drift is a red banner** in the admin area, and each swallowed `42P01` is recorded
  as `skipped` once (PM49) rather than being silent.
- **The deployed commit** (`VERCEL_GIT_COMMIT_SHA`) and deploy time show in the admin area and go
  on every error and job record, so a fault can be matched to the deploy that brought it.

Built: `/api/health` is 503 when the database is down, a migration isn't applied or the cron has
stopped. The migrations a build ships are listed at build time, as the files aren't deployed.

