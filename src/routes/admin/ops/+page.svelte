<script lang="ts">
	import AttentionList from '#lib/components/AttentionList.svelte';
	import { ago, plural } from '#lib/format.ts';

	let { data, form } = $props();
	const n = $derived(data.now);
	const secs = (ms: number | null | undefined) =>
		ms == null ? '—' : `${(ms / 1000).toFixed(1)} s`;
	const pct = (b: { remaining: number; limit: number }) =>
		b.limit ? Math.round((b.remaining / b.limit) * 100) : 0;
</script>

<svelte:head><title>Operations · Admin · Project Magic</title></svelte:head>

<section class="block" id="attention">
	<h2>Needs attention</h2>
	<AttentionList items={data.attention} />
</section>

<section class="block" id="now">
	<h2>Now</h2>
	<div class="stats">
		<div class="stat">
			<b><code>{n.version}</code></b><span class="muted"
				>deployed{n.builtAt ? `, built ${ago(n.builtAt)}` : ''}</span
			>
		</div>
		<div class="stat" class:bad={!n.db.ok}>
			<b>{n.db.ok ? `${n.db.ms} ms` : 'down'}</b><span class="muted">database</span>
		</div>
		<div class="stat" class:bad={!!n.migrations?.missing.length}>
			<b
				>{n.migrations
					? `${n.migrations.shipped - n.migrations.missing.length}/${n.migrations.shipped}`
					: '?'}</b
			><span class="muted">migrations applied</span>
		</div>
		<div class="stat" class:bad={!n.cron.lastStartedAt}>
			<b>{ago(n.cron.lastStartedAt)}</b><span class="muted">cron last ran</span>
		</div>
	</div>
	<p class="muted small pills">
		{#each Object.entries(n.configured) as [k, on] (k)}<span class="pill" class:active={on}
				>{k}: {on ? 'set' : 'not set'}</span
			>{/each}
		· An uptime check can watch <a href="/api/health"><code>/api/health</code></a>.
	</p>
</section>

<section class="block" id="cron">
	<div class="row">
		<h2>Cron</h2>
		<form method="POST" action="?/fix">
			<input type="hidden" name="action" value="cron" /><input
				type="hidden"
				name="back"
				value="/admin/ops#cron"
			/>
			<button class="button">Run it now</button>
		</form>
	</div>
	<p class="muted small">
		Daily at 05:00 UTC: re-syncs everything a webhook missed, saves held edits, tidies, reconciles
		billing, purges deleted tenants, sends digests and checks alerts.
	</p>
	{#if data.runs.length}
		<div class="scroll">
			<table class="data">
				<thead><tr><th>Started</th><th>Took</th><th>Steps</th></tr></thead>
				<tbody>
					{#each data.runs as r (r.id)}
						<tr>
							<td title={r.startedAt}>{ago(r.startedAt)}</td>
							<td
								>{r.endedAt
									? secs(Date.parse(r.endedAt) - Date.parse(r.startedAt))
									: 'running or died'}</td
							>
							<td class="steps pills">
								{#each r.steps as s (s.step)}
									<span
										class="pill"
										class:active={s.ok}
										class:suspended={!s.ok}
										title={[
											s.error ?? '',
											Object.entries(s.counts ?? {})
												.map(([k, v]) => `${k} ${v}`)
												.join(', '),
											secs(s.ms)
										]
											.filter(Boolean)
											.join(' · ')}>{s.step}</span
									>
								{/each}
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{:else}
		<p class="muted">No cron run is recorded yet.</p>
	{/if}
</section>

<section class="block" id="errors">
	<div class="row">
		<h2>Errors</h2>
		<form method="POST" action="?/ref" class="inline">
			<input
				type="search"
				name="ref"
				placeholder="Reference, e.g. k3m9xq2a"
				aria-label="Error reference"
			/>
			<button class="button">Find</button>
		</form>
	</div>
	{#if form?.message}<p class="flash error" role="alert">{form.message}</p>{/if}
	{#if data.errors.length}
		<div class="scroll">
			<table class="data">
				<thead
					><tr><th>Error</th><th>Where</th><th>Hour</th><th>Day</th><th>Week</th><th>Last</th></tr
					></thead
				>
				<tbody>
					{#each data.errors as e (e.fingerprint)}
						<tr>
							<td class="msg"
								><a href="/admin/ops/errors/{encodeURIComponent(e.fingerprint)}"
									>{e.message.slice(0, 140)}</a
								></td
							>
							<td><span class="pill">{e.source}</span> <code>{e.route ?? '—'}</code></td>
							<td>{e.hour}</td>
							<td>{e.day}</td>
							<td>{e.week}</td>
							<td title={e.lastSeen}>{ago(e.lastSeen)}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
		<p class="small"><a href="/admin/ops/errors">All errors, resolved ones too</a></p>
	{:else}
		<p class="muted">No unresolved errors.</p>
	{/if}
</section>

<section class="block" id="jobs">
	<h2>Background work, last 24 hours</h2>
	{#if data.jobs.length}
		<div class="scroll">
			<table class="data">
				<thead><tr><th>Kind</th><th>Runs</th><th>Problems</th><th>Slowest</th></tr></thead>
				<tbody>
					{#each data.jobs as j (j.kind)}
						<tr class:bad={j.failed > 0}>
							<td><a href="/admin/ops/jobs?kind={encodeURIComponent(j.kind)}">{j.kind}</a></td>
							<td>{j.runs}</td>
							<td
								>{#if j.failed}<a
										href="/admin/ops/jobs?kind={encodeURIComponent(j.kind)}&outcome=problem"
										>{j.failed}</a
									>{:else}0{/if}</td
							>
							<td>{secs(j.slowestMs)}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{:else}
		<p class="muted">Nothing recorded in the last day.</p>
	{/if}
	<p class="small">
		<a href="/admin/ops/jobs">Every run</a> ·
		<a href="/admin/ops/jobs?outcome=problem">Only problems</a>
	</p>
</section>

<section class="block" id="webhooks">
	<h2>Webhooks, last 24 hours</h2>
	{#if data.deliveries.length}
		<p class="pills">
			{#each data.deliveries as d (d.outcome)}<span
					class="pill"
					class:suspended={d.outcome === 'failed'}>{d.outcome}: {d.n}</span
				>{/each}
		</p>
	{:else}
		<p class="muted">No deliveries in the last day.</p>
	{/if}
	<p class="small"><a href="/admin/ops/webhooks">Every delivery</a></p>
</section>

<section class="block" id="github">
	<div class="row">
		<h2>GitHub</h2>
		<form method="POST" action="?/fix">
			<input type="hidden" name="action" value="projects" /><input
				type="hidden"
				name="back"
				value="/admin/ops#github"
			/>
			<button class="button">List installations again</button>
		</form>
	</div>
	{#if data.github.length}
		<div class="scroll">
			<table class="data">
				<thead
					><tr><th>Token</th><th>Resource</th><th>Left</th><th>Resets</th><th>Seen</th></tr></thead
				>
				<tbody>
					{#each data.github as b (b.scope + b.resource)}
						<tr class:bad={pct(b) < 20}>
							<td><code>{b.scope}</code></td>
							<td>{b.resource}</td>
							<td>{b.remaining} of {b.limit} ({pct(b)}%)</td>
							<td>{b.resetAt.slice(11, 16)} UTC</td>
							<td>{ago(b.updatedAt)}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{:else}
		<p class="muted">No calls to GitHub recorded yet.</p>
	{/if}
</section>

<section class="block" id="ai">
	<h2>AI today</h2>
	{#if data.ai.usage.length || data.ai.failures.length}
		<p class="pills">
			{#each data.ai.failures as f (f.kind + f.outcome)}<span
					class="pill"
					class:active={f.outcome === 'ok'}
					class:suspended={f.outcome === 'failed'}>{f.kind} {f.outcome}: {f.n}</span
				>{/each}
		</p>
		<p class="muted small">
			Tokens: {#each data.ai.usage as u, i (u.scope)}{i ? ' · ' : ''}<code>{u.scope}</code>
				{u.tokens}{/each}
		</p>
	{:else}
		<p class="muted">No AI use today.</p>
	{/if}
</section>

<section class="block" id="alerts">
	<div class="row">
		<h2>Alerts</h2>
		<form method="POST" action="?/fix">
			<input type="hidden" name="action" value="alerts" /><input
				type="hidden"
				name="back"
				value="/admin/ops#alerts"
			/>
			<button class="button">Check now</button>
		</form>
	</div>
	<p class="muted small">
		{#if data.alerts.connected}
			Sent to Slack when a problem starts and when it clears, with a summary after each daily cron.
		{:else}
			Not sent anywhere yet. Set a Slack webhook under <a href="/admin/settings#alerts">Settings</a> to
			be told.
		{/if}
	</p>
	{#if data.open.length}
		<ul class="open">
			{#each data.open as a (a.key)}
				<li>
					<b>{a.title}</b>
					<span class="muted">since {ago(a.openedAt)}{a.notifiedAt ? ', sent' : ''}</span>
				</li>
			{/each}
		</ul>
	{:else}
		<p class="muted">{plural(0, 'alert')} open.</p>
	{/if}
</section>

<style>
	.block {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}
	.block h2 {
		margin: 0;
	}
	.row {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 0.75rem;
		flex-wrap: wrap;
	}
	.row form {
		margin: 0;
	}
	.inline {
		display: flex;
		gap: 0.4rem;
	}
	.inline input {
		border: 1px solid var(--line-strong);
		background: var(--card);
		border-radius: var(--radius);
		padding: 0.3rem 0.5rem;
		min-width: 0;
	}
	.stat.bad b,
	tr.bad td {
		color: var(--danger);
	}
	.stat b code {
		font-size: 22px;
	}
	.scroll {
		overflow-x: auto;
		max-width: 100%;
	}
	.msg {
		overflow-wrap: anywhere;
		min-width: 14rem;
	}
	.steps {
		min-width: 16rem;
	}
	.pills {
		display: flex;
		flex-wrap: wrap;
		gap: 0.3rem;
		align-items: center;
	}
	.open {
		margin: 0;
		padding-left: 1.2rem;
	}
	.small {
		font-size: 13px;
	}
</style>
