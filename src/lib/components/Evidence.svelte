<script lang="ts">
	// What a person checks before accepting a built item (PM39): its PR's diff, CI and preview, and
	// the item's acceptance criteria. Missing facts are left out, never shown as unknown.
	import type { Evidence } from '#lib/core/evidence.ts';

	let { evidence }: { evidence: Evidence } = $props();
	const CI = { success: 'CI passed', failure: 'CI failed', pending: 'CI running' } as const;
	const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`;
</script>

<span class="evidence small">
	{#if evidence.pr}
		<span
			>{#if evidence.pr.url}<a href={evidence.pr.url}>PR #{evidence.pr.number}</a>{:else}PR #{evidence
					.pr.number}{/if}</span
		>
		{#if evidence.additions !== undefined && evidence.files !== undefined}
			<span
				>+{evidence.additions}
				<span class="del">−{evidence.deletions}</span> in {plural(evidence.files, 'file')}</span
			>
		{/if}
		{#if evidence.ci}<span class="ci {evidence.ci}">{CI[evidence.ci]}</span>{/if}
		{#if evidence.preview}<span><a href={evidence.preview}>Preview</a></span>{/if}
	{:else}
		<span class="muted">No merged PR names it</span>
	{/if}
	{#if evidence.criteria}
		<span
			>{evidence.criteria.done} of {evidence.criteria.total}
			{evidence.criteria.total === 1 ? 'criterion' : 'criteria'} ticked</span
		>
	{/if}
</span>

<style>
	.evidence {
		display: inline-flex;
		flex-wrap: wrap;
		gap: 0 0.6rem;
	}
	.evidence > span:not(:last-child)::after {
		content: '·';
		margin-left: 0.6rem;
		color: var(--muted);
	}
	.del,
	.ci.failure {
		color: var(--danger);
	}
</style>
