<script lang="ts">
	import type { Snippet } from 'svelte';

	// On a wide screen the filters sit in the row as they always did; on a phone they fold behind
	// one button (PM34).
	let { children, active = 0 }: { children: Snippet; active?: number } = $props();
	let open = $state(false);
</script>

<button
	type="button"
	class="button toggle"
	aria-expanded={open}
	aria-controls="filter-fields"
	onclick={() => (open = !open)}
>
	Filters{active ? ` (${active})` : ''}
	<span aria-hidden="true">{open ? '▴' : '▾'}</span>
</button>
<div id="filter-fields" class="fields" class:open>{@render children()}</div>

<style>
	.fields {
		display: contents;
	}
	.toggle {
		display: none;
	}
	@media (max-width: 760px) {
		.toggle {
			display: inline-flex;
			gap: 0.4rem;
			align-items: center;
		}
		.fields {
			display: none;
		}
		.fields.open {
			display: flex;
			flex-direction: column;
			align-items: stretch;
			gap: 0.6rem;
			flex-basis: 100%;
			padding: 0.6rem 0.8rem;
			background: var(--surface-1);
			border-radius: var(--radius);
		}
		.fields.open :global(label) {
			justify-content: space-between;
		}
	}
</style>
