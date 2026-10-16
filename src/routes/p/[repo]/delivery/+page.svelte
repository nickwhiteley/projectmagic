<script lang="ts">
	import { page } from '$app/state';
	import WeekBars from '#lib/components/WeekBars.svelte';
	import { duration } from '#lib/format.ts';

	let { data } = $props();
	const repo = $derived(page.params.repo!);
	const rate = (r: { count: number; of: number; rate: number | null }) =>
		r.rate === null
			? `${r.count} of ${r.of} deploys`
			: `${Math.round(r.rate * 100)}% (${r.count} of ${r.of})`;
</script>

<svelte:head><title>Delivery · {page.data.project.name}</title></svelte:head>

<p class="muted small">
	How this project moves, against its own past. Counts are shown as counts until there are enough
	for a rate, and there are no targets. Deploys of a Project Magic edit change nothing that runs, so
	they are left out.
</p>

{#if !data.has}
	<p class="muted">
		No deployments, merged pull requests or CI runs are stored yet. They are read on the next sync
		(after the PM9 migration has been run).
	</p>
{/if}

<section id="deploys">
	<h2>Deploys</h2>
	<p>
		<strong>{data.deploysThisWeek}</strong> this week ·
		<a href={data.githubDeployments}>{data.realDeploys} production deploys</a>
		in 120 days{#if data.editDeploysLeftOut}
			<span class="muted"> ({data.editDeploysLeftOut} of edits left out)</span>{/if}
	</p>
	<WeekBars points={data.deploysPerWeek} label="Production deploys" />
</section>

<section id="lead">
	<h2>Lead time for changes</h2>
	<p>
		<strong>{duration(data.leadTimeHours)}</strong> median, merged PRs in 4 weeks, from the first commit
		to the production deploy
	</p>
	{#if data.leadTimes.length}
		<ul class="evidence">
			{#each data.leadTimes as t (t.number)}
				<li>
					<a
						href={t.url ?? `https://github.com/${page.data.project.owner}/${repo}/pull/${t.number}`}
						>#{t.number}</a
					>
					{t.title} <span class="muted">{duration(t.hours)}</span>
				</li>
			{/each}
		</ul>
	{/if}
</section>

<section id="failure">
	<h2>Change failure</h2>
	<p>
		<strong>{rate(data.failure)}</strong> production bug fixes over production deploys, 4 weeks
	</p>
</section>

<section id="restore">
	<h2>Time to restore</h2>
	<p>
		<strong>{duration(data.medianRestoreHours)}</strong> median, from <code>Raised:</code> (or the fix's
		first commit) to the production deploy
	</p>
	{#if data.restores.length}
		<ul class="evidence">
			{#each data.restores as r (r.number)}
				<li>
					<a
						href={r.url ?? `https://github.com/${page.data.project.owner}/${repo}/pull/${r.number}`}
						>#{r.number}</a
					>
					{r.title}
					<span class="muted"
						>{r.hours === null ? 'not deployed yet' : duration(r.hours)} · from {r.from}</span
					>
				</li>
			{/each}
		</ul>
	{:else}
		<p class="muted small">
			No pull request says <code>Bug: production</code> yet.
		</p>
	{/if}
</section>

<section id="throughput">
	<h2>Throughput</h2>
	<p class="muted small">Items shipped a week, weighted by size (S = 1, M = 3, L = 8).</p>
	<WeekBars points={data.throughput} label="Size-weighted items shipped" />
	<p>
		Item lead time <strong
			>{data.leadDays === null ? '—' : `${Math.round(data.leadDays * 10) / 10} days`}</strong
		>, cycle time
		<strong>{data.cycleDays === null ? '—' : `${Math.round(data.cycleDays * 10) / 10} days`}</strong
		>
		<span class="muted"> (median of {data.itemsTimed} items shipped in 4 weeks)</span>
	</p>
</section>

<section id="queue">
	<h2>The founder queue</h2>
	{#if data.founder.length}
		<p>
			<strong>{data.founder.length}</strong> built or blocked, waiting on a person, oldest first
		</p>
		<ul class="evidence">
			{#each data.founder as f (f.id)}
				<li>
					<a href="/p/{repo}/i/{encodeURIComponent(f.id)}"><code>{f.id}</code></a>
					{@html f.titleHtml}
					<span class="muted"
						>{f.status} · {f.days === null
							? 'age unknown'
							: `${f.days} day${f.days === 1 ? '' : 's'}`}</span
					>
					{#if f.waitingHtml}<div class="muted small">{@html f.waitingHtml}</div>{/if}
				</li>
			{/each}
		</ul>
	{:else}
		<p class="muted">Nothing is waiting on a person.</p>
	{/if}
</section>

<section id="health">
	<h2>Main's CI</h2>
	{#if data.health.runs || data.health.unstarted}
		<p>
			<a href={data.githubActions}>{data.health.runs} runs</a> in 4 weeks,
			{#if data.health.failRate !== null}<strong>{Math.round(data.health.failRate * 100)}%</strong>
				failed
			{:else}
				<strong>{data.health.failed}</strong> failed
			{/if}
			{#if data.health.redNow !== null}· <strong>red for {duration(data.health.redNow)}</strong>
			{:else if data.health.longestRed !== null}· longest red stretch {duration(
					data.health.longestRed
				)}{/if}
		</p>
		{#if data.health.unstarted}
			<p class="muted small">
				{data.health.unstarted} run{data.health.unstarted === 1 ? '' : 's'} never started (no job ran
				a step, as when Actions billing fails). They are not counted as failures.
			</p>
		{/if}
	{:else}
		<p class="muted">No CI runs on main are stored.</p>
	{/if}
</section>

<style>
	section {
		margin-bottom: 1.6rem;
	}
	h2 {
		font: 20px var(--serif);
		margin: 0 0 0.4rem;
	}
	.small {
		font-size: 12.5px;
	}
	.evidence {
		list-style: none;
		padding: 0;
		margin: 0.4rem 0 0;
	}
	.evidence li {
		padding: 0.25rem 0;
		border-bottom: 1px solid var(--line);
	}
</style>
