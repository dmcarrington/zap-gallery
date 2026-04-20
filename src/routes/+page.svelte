<script lang="ts">
	import ImageGrid from '$lib/components/ImageGrid.svelte';
	import ProUpgrade from '$lib/components/ProUpgrade.svelte';
	import { getGallery } from '$lib/stores/gallery.svelte';

	const gallery = getGallery();

	// Check URL for pubkey parameter (for Pro tier upgrade)
	const searchParams = new URLSearchParams(window.location.search);
	const pubkey = searchParams.get('pubkey') || '';
	const isPro = searchParams.get('pro') === '1';
</script>

<div class="min-h-screen bg-gray-900 text-white">
	<div class="container mx-auto px-4 py-8">
		<header class="mb-8">
			<h1 class="text-3xl font-bold">Nostr Zap Gallery</h1>
			<p class="text-gray-400 mt-2">
				Browse images and send zaps to unlock full-resolution downloads.
			</p>
			{#if pubkey}
				<p class="text-sm text-amber-400 mt-2">User: <code>{pubkey.substring(0, 16)}...</code></p>
			{/if}
		</header>

		{#if pubkey}
			<ProUpgrade pubkey={pubkey} priceSats={100000} />
		{/if}

		{#if gallery.loading}
			<p class="text-gray-500 italic">Loading gallery...</p>
		{:else}
			<ImageGrid images={gallery.images} />
		{/if}
	</div>
</div>
