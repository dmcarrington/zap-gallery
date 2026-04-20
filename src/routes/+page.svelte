<script lang="ts">
	import ImageGrid from '$lib/components/ImageGrid.svelte';
	import ProUpgrade from '$lib/components/ProUpgrade.svelte';
	import { getGallery } from '$lib/stores/gallery.svelte';
	import { GALLERY_OWNER_PUBKEY } from '$lib/config';

	const gallery = getGallery();

	// Check URL for pubkey parameter (for Pro tier upgrade)
	const searchParams = new URLSearchParams(window.location.search);
	const pubkey = searchParams.get('pubkey') || '';
	const isPro = searchParams.get('pro') === '1';
	const isOwner = pubkey === GALLERY_OWNER_PUBKEY || (pubkey === '' && typeof window !== 'undefined' && window.location.pathname.startsWith('/@'));
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
			{#if isOwner}
				<a href="/admin" class="mt-3 inline-block bg-amber-500 text-black px-4 py-2 rounded font-medium hover:bg-amber-400">
					 Owner Dashboard
				</a>
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
