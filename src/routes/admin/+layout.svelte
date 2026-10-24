<script lang="ts">
	import { page } from '$app/state';
	import Tabs from '#lib/components/Tabs.svelte';

	let { children } = $props();
	// What a fix on the Operations tab came back with (PM51).
	const done = $derived(page.url.searchParams.get('done'));
	const failed = $derived(page.url.searchParams.get('failed'));
</script>

<div class="admin">
	<h1>Admin</h1>
	<Tabs
		label="Admin"
		items={[
			{ href: '/admin', label: 'Overview' },
			{ href: '/admin/ops', label: 'Operations' },
			{ href: '/admin/tenants', label: 'Tenants' },
			{ href: '/admin/tiers', label: 'Tiers & prices' },
			{ href: '/admin/users', label: 'Users' },
			{ href: '/admin/installations', label: 'Installations' },
			{ href: '/admin/settings', label: 'Settings' },
			{ href: '/admin/feedback', label: 'Feedback' },
			{ href: '/admin/audit', label: 'Audit' }
		]}
	/>
	{#if done}<p class="flash" role="status">{done}</p>{/if}
	{#if failed}<p class="flash error" role="alert">{failed}</p>{/if}
	{@render children()}
</div>
