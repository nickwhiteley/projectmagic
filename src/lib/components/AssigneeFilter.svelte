<script lang="ts">
	// The For filter on the List and the Board (PM16). The value is a path, or `mine` for the
	// signed-in person; assigneeMatches decides what each shows.
	let {
		value,
		assignees,
		signedIn,
		onchange
	}: {
		value: string;
		assignees: string[];
		signedIn: boolean;
		onchange: (value: string) => void;
	} = $props();
	const label = (a: string) => (a === 'person' ? 'people' : a === 'agent' ? 'agents' : a);
</script>

<label
	>For
	<select {value} onchange={(e) => onchange(e.currentTarget.value)}>
		<option value="">anyone</option>
		{#if signedIn}<option value="mine">mine</option>{/if}
		{#each assignees as a (a)}<option value={a}>{label(a)}</option>{/each}
	</select>
</label>
