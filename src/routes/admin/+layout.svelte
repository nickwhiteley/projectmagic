<script lang="ts">
	import Tabs from '#lib/components/Tabs.svelte';

	let { children } = $props();
</script>

<div class="admin">
	<h1>Admin</h1>
	<Tabs
		label="Admin"
		items={[
			{ href: '/admin', label: 'Overview' },
			{ href: '/admin/tenants', label: 'Tenants' },
			{ href: '/admin/tiers', label: 'Tiers & prices' },
			{ href: '/admin/users', label: 'Users' },
			{ href: '/admin/installations', label: 'Installations' },
			{ href: '/admin/settings', label: 'Settings' },
			{ href: '/admin/feedback', label: 'Feedback' },
			{ href: '/admin/audit', label: 'Audit' }
		]}
	/>
	{@render children()}
</div>
