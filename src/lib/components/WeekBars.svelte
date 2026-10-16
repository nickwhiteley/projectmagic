<script lang="ts">
	// Weekly bars with a 4-week rolling line, and no thresholds or colours that judge (spec §16.3).
	let {
		points,
		label,
		unit = ''
	}: {
		points: { week: string; value: number; rolling: number }[];
		label: string;
		unit?: string;
	} = $props();
	const max = $derived(Math.max(1, ...points.flatMap((p) => [p.value, p.rolling])));
	const w = 14;
	const gap = 4;
	const h = 60;
	const x = (i: number) => i * (w + gap);
	const y = (v: number) => h - (v / max) * h;
	const line = $derived(points.map((p, i) => `${x(i) + w / 2},${y(p.rolling)}`).join(' '));
</script>

<svg
	viewBox="0 0 {points.length * (w + gap)} {h + 2}"
	role="img"
	aria-label="{label}, by week: {points.map((p) => p.value).join(', ')}"
>
	{#each points as p, i (p.week)}
		<rect x={x(i)} y={y(p.value)} width={w} height={Math.max(0, h - y(p.value))} class="bar">
			<title>Week of {p.week}: {p.value}{unit}</title>
		</rect>
	{/each}
	<polyline points={line} class="line" />
</svg>

<style>
	svg {
		width: 100%;
		max-width: 28rem;
		height: auto;
		display: block;
	}
	.bar {
		fill: var(--st-todo);
	}
	.line {
		fill: none;
		stroke: var(--st-progress);
		stroke-width: 1.5;
	}
</style>
