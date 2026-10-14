<script lang="ts">
	import type { Status } from '#lib/core/meta.ts';

	let { status, small = false }: { status: Status | string; small?: boolean } = $props();
	const key = $derived(
		status === 'in progress' ? 'progress' : status === 'in review' ? 'review' : status
	);
</script>

<span class="pill {key}" class:small>{status}</span>

<style>
	.pill {
		display: inline-block;
		font: 500 12px/18px var(--sans);
		padding: 0 0.5rem;
		border-radius: 999px;
		white-space: nowrap;
		color: var(--st-todo);
		background: var(--st-todo-bg);
	}
	.small {
		font-size: 11px;
		line-height: 16px;
		padding: 0 0.4rem;
	}
	.progress {
		color: var(--st-progress);
		background: var(--st-progress-bg);
	}
	.blocked {
		color: var(--st-blocked);
		background: var(--st-blocked-bg);
	}
	.review {
		color: var(--st-review);
		background: var(--st-review-bg);
	}
	.built {
		color: var(--st-built);
		background: var(--st-built-bg);
	}
	.done,
	.skipped {
		color: var(--st-done);
		background: var(--st-done-bg);
	}
	.unknown {
		color: var(--danger);
		background: var(--del-bg);
	}
</style>
