<script lang="ts">
	import { getAuth } from '$lib/stores/auth.svelte';
	import { goto } from '$app/navigation';
	import { browser } from '$app/environment';

	let { children } = $props();

	const auth = getAuth();

	$effect(() => {
		if (browser && !auth.isOwner && !auth.isLoggedIn) {
			// Don't redirect immediately — user may still be auto-logging in
		}
	});
</script>

{#if auth.isOwner}
	{@render children()}
{:else if auth.isLoggedIn}
	<div class="text-center py-20">
		<h1 class="text-2xl font-bold text-red-400">Access Denied</h1>
		<p class="text-gray-400 mt-2">Only the gallery owner can access this page.</p>
		<a href="/" class="text-purple-400 hover:text-purple-300 mt-4 inline-block">
			Back to gallery
		</a>
	</div>
{:else}
	<div class="text-center py-20">
		<h1 class="text-2xl font-bold text-gray-400">Login Required</h1>
		<p class="text-gray-400 mt-2">Log in with the gallery owner's Nostr account to access admin.</p>
	</div>
{/if}
