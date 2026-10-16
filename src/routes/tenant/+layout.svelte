<script lang="ts">
	import Tabs from '#lib/components/Tabs.svelte';

	let { children } = $props();
</script>

<div class="admin">
	<h1>Tenant</h1>
	<Tabs
		label="Tenant"
		items={[
			{ href: '/tenant', label: 'Overview' },
			{ href: '/tenant/members', label: 'Members' },
			{ href: '/tenant/access', label: 'Access' },
			{ href: '/tenant/installations', label: 'Installations' },
			{ href: '/tenant/settings', label: 'Settings' },
			{ href: '/tenant/audit', label: 'Audit' },
			{ href: '/tenant/delete', label: 'Delete tenant' }
		]}
	/>
	{@render children()}
</div>
