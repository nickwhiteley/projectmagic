<script lang="ts">
	// The Epic filter on the List and the Board (PM1).
	let {
		value,
		epics,
		onchange
	}: {
		value: string;
		epics: { id: string; title: string | null }[];
		onchange: (value: string) => void;
	} = $props();
</script>

{#if epics.length}
	<label
		>Epic
		<select {value} onchange={(e) => onchange(e.currentTarget.value)}>
			<option value="">any</option>
			{#each epics as e (e.id)}<option value={e.id}>{e.id}{e.title ? ` ${e.title}` : ''}</option
				>{/each}
		</select>
	</label>
{/if}
