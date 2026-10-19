<script lang="ts">
	import { renderMarkdown } from '#lib/core/render.ts';
	import { STATUSES } from '#lib/core/meta.ts';

	interface Values {
		id: string;
		title: string;
		star: boolean;
		job: string;
		size: string;
		status: string;
		waiting: string;
		plan: string;
		branch: string;
		assignee: string;
		epic: string;
		body: string;
	}
	let {
		values,
		jobs,
		tasks,
		assignees = ['person', 'agent'],
		epics = [],
		idHint = null,
		idLocked = false
	}: {
		values: Values;
		jobs: string[];
		tasks: { number: string; title: string }[];
		assignees?: string[];
		epics?: { id: string; title: string | null }[];
		idHint?: string | null;
		idLocked?: boolean;
	} = $props();

	// The form owns its values once open; a returned form after a refusal starts again from them.
	// svelte-ignore state_referenced_locally
	let v = $state({ ...values });
	let preview = $state(false);
	const html = $derived(preview ? renderMarkdown(v.body) : '');
	const showWaiting = $derived(['blocked', 'built'].includes(v.status) || !!v.waiting);
</script>

<div class="grid">
	<label>
		<span class="label">Id</span>
		<input
			name="id"
			class="mono"
			bind:value={v.id}
			readonly={idLocked}
			required
			autocomplete="off"
		/>
		{#if idHint}<small class="muted">{idHint}</small>{/if}
	</label>
	<label class="wide">
		<span class="label">Title</span>
		<input name="title" bind:value={v.title} required />
	</label>
	<label>
		<span class="label">Status</span>
		<select name="status" bind:value={v.status}>
			{#each STATUSES as s (s)}<option value={s}>{s}</option>{/each}
		</select>
	</label>
	<label>
		<span class="label">Job</span>
		<input name="job" list="jobs" bind:value={v.job} autocomplete="off" />
		<datalist id="jobs"
			>{#each jobs as j (j)}<option value={j}></option>{/each}</datalist
		>
	</label>
	<label>
		<span class="label">Size</span>
		<input name="size" list="sizes" bind:value={v.size} autocomplete="off" />
		<datalist id="sizes"
			>{#each ['S', 'S–M', 'M', 'M–L', 'L'] as s (s)}<option value={s}></option>{/each}</datalist
		>
	</label>
	<label>
		<span class="label">For</span>
		<input
			name="assignee"
			class="mono"
			list="assignees"
			bind:value={v.assignee}
			placeholder="anyone"
			autocomplete="off"
		/>
		<datalist id="assignees"
			>{#each assignees as a (a)}<option value={a}></option>{/each}</datalist
		>
		<small class="muted">person.&lt;login&gt; or agent.claude… Empty is anyone’s.</small>
	</label>
	<label>
		<span class="label">Epic</span>
		<input name="epic" list="epics" bind:value={v.epic} placeholder="none" autocomplete="off" />
		<datalist id="epics"
			>{#each epics as e (e.id)}<option value={e.id}>{e.title ?? ''}</option>{/each}</datalist
		>
		<small class="muted">Pick an epic, or type a new name to start one. Empty is none.</small>
	</label>
	<label class="check">
		<input type="checkbox" name="star" bind:checked={v.star} />
		<span>★ On the cut line</span>
	</label>
	{#if showWaiting}
		<label class="wide">
			<span class="label">Waiting on</span>
			<input name="waiting" bind:value={v.waiting} placeholder="who or what it waits on" />
		</label>
	{:else}
		<input type="hidden" name="waiting" value={v.waiting} />
	{/if}
	<label class="wide">
		<span class="label">Plan tasks</span>
		<input name="plan" list="tasks" bind:value={v.plan} placeholder="46, 49" autocomplete="off" />
		<datalist id="tasks"
			>{#each tasks as t (t.number)}<option value={t.number}>{t.title}</option>{/each}</datalist
		>
	</label>
	<label class="wide">
		<span class="label">Branch</span>
		<input
			name="branch"
			class="mono"
			bind:value={v.branch}
			placeholder="feat/nw9-dxf-export"
			autocomplete="off"
		/>
	</label>
</div>

<div class="body">
	<div class="tabs">
		<span class="label">Body</span>
		<button type="button" class:on={!preview} onclick={() => (preview = false)}>Write</button>
		<button type="button" class:on={preview} onclick={() => (preview = true)}>Preview</button>
	</div>
	<textarea name="body" bind:value={v.body} rows="16" class:hidden={preview}></textarea>
	{#if preview}<div class="prose preview">{@html html}</div>{/if}
</div>

<style>
	.grid {
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		gap: 0.8rem 1rem;
	}
	label {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}
	.wide {
		grid-column: span 2;
	}
	.check {
		flex-direction: row;
		align-items: center;
		gap: 0.5rem;
		padding-top: 1.2rem;
	}
	input:not([type='checkbox']),
	select,
	textarea {
		border: 1px solid var(--line-strong);
		background: var(--card);
		border-radius: var(--radius);
		padding: 0.4rem 0.55rem;
		width: 100%;
	}
	.mono,
	textarea {
		font-family: var(--mono);
		font-size: 13px;
	}
	small {
		font-size: 12px;
	}
	.body {
		margin-top: 1.2rem;
	}
	.tabs {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		margin-bottom: 0.4rem;
	}
	.tabs .label {
		margin-right: auto;
	}
	.tabs button {
		border: 1px solid var(--line);
		background: none;
		border-radius: var(--radius);
		padding: 0.15rem 0.6rem;
		cursor: pointer;
		font-size: 12.5px;
	}
	.tabs button.on {
		background: var(--surface-3);
	}
	textarea {
		line-height: 1.55;
		resize: vertical;
	}
	.hidden {
		display: none;
	}
	.preview {
		border: 1px solid var(--line);
		border-radius: var(--radius);
		padding: 0.8rem 1rem;
		min-height: 10rem;
		max-width: none;
	}
	@media (max-width: 760px) {
		.grid {
			grid-template-columns: 1fr 1fr;
		}
	}
</style>
