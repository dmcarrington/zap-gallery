<script lang="ts">
	import { onMount } from 'svelte';
	import { fetchSellerImages } from '$lib/stores/gallery.svelte';
	import { page } from '$app/stores';
	import type { GalleryImage } from '$lib/nostr/events';
	import ImageCard from '$lib/components/ImageCard.svelte';
	import { GALLERY_OWNER_PUBKEY } from '$lib/config';

	const { data } = $page;
	const pubkey: string = data.params.pubkey;
	const isOwner = pubkey === GALLERY_OWNER_PUBKEY;

	let images = $state<GalleryImage[]>([]);
	let loading = $state(true);
	let error = $state<string | null>(null);

	onMount(async () => {
		try {
			images = await fetchSellerImages(pubkey);
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to load gallery';
		} finally {
			loading = false;
		}
	});
</script>

<div class="container mx-auto px-4 py-8">
	<header class="mb-8">
		<h1 class="text-2xl font-bold text-white">
			{isOwner ? 'Your Gallery' : `Gallery of ${pubkey.slice(0, 8)}...${pubkey.slice(-4)}`}
		</h1>
		<p class="text-gray-400 mt-1 text-sm">
			{images.length} image{images.length !== 1 ? 's' : ''} · Pay with Lightning to download full-res
		</p>
	</header>

	{#if error}
		<div class="bg-red-500/10 border border-red-500/50 text-red-400 p-4 rounded">{error}</div>
	{/if}

	{#if loading}
		<div class="text-center py-12">
			<p class="text-gray-500">Loading gallery...</p>
		</div>
	{:else if images.length === 0}
		<div class="text-center py-12 bg-gray-900 border border-gray-800 rounded-lg">
			<p class="text-gray-500">No images published yet.</p>
			{#if isOwner}
				<a href="/admin" class="text-purple-400 hover:underline text-sm mt-2 inline-block">Upload your first image</a>
			{/if}
		</div>
	{:else}
		<div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
			{#each images as image}
				<ImageCard {image} />
			{/each}
		</div>
	{/if}
</div>
