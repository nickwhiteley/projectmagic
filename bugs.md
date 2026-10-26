# Bugs

Bugs found in this project, in the same format as `backlog.md`. Give each a `BUG` id and `**Type:** bug`:

    ### BUG1 What is broken
    **Status:** todo · **Type:** bug · **Found:** production · **Raised:** 2026-01-01 09:00

### BUG1 The unsaved edits bar runs the edit and its author together
**Status:** todo · **Size:** S · **Type:** bug · **Found:** development · **For:** agent

Seen on 2026-10-19 while trying PM32: with batch edits on, the list of unsaved edits reads
"comment on PT2by nickwhiteley", with no space before "by". It affects every pending edit's label.
The space at the start of `<span class="muted"> by {e.by}</span>` in `src/routes/p/[repo]/+layout.svelte`
is dropped. Put the space outside the span, for example `{' '}<span class="muted">by {e.by}</span>`.

### BUG2 The Epics tab runs status counts together
**Status:** todo · **Size:** S · **Type:** bug · **Found:** development · **For:** agent

Seen on 2026-10-19 while trying PM36: under an epic's bar, the counts read "0 of 2 done · 1 built,1
todo", with no space after the comma. The `{#if i},{/if}` in the counts' `{#each}` in
`src/routes/p/[repo]/epics/+page.svelte` loses the whitespace between the comma and the next count.
Write the separator as `{#if i}, {/if}` or `{i ? ', ' : ''}`.

### BUG3 Connecting GitHub fails with a 500 when GitHub refuses the person's access token
**Status:** built, waiting on Nick's check · **Size:** S · **Type:** bug · **Found:** production · **Raised:** 2026-10-26 12:00

Seen on 2026-10-26 (version 4420630, ref `ugysapee`): a new user, signed in from an incognito window,
installed the App on a different GitHub org. On the way back, `/tenant/installations/setup` returned a
500 with `GitHub 401 /user/installations?per_page=100: Bad credentials`. GitHub can refuse a user access
token before it expires: one it has only just issued, or one it revoked while another server instance
still had it cached. The user client treated any 401 as fatal. Now `userClient` in
`src/lib/server/user-token.ts` drops the cached token on a 401, waits a second and tries once more with a
fresh one. If GitHub refuses that one as well, it asks the person to sign in again instead of returning a 500.
