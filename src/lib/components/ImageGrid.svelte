<script lang="ts">
	import type { GalleryImage } from '$lib/nostr/events';
	import ImageCard from './ImageCard.svelte';

	let { images, loading = false }: { images: GalleryImage[]; loading?: boolean } = $props();
</script>

{#if loading}
	<div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
		{#each Array(8) as _}
			<div class="aspect-square rounded-lg bg-gray-800 animate-pulse"></div>
		{/each}
	</div>
{:else if images.length === 0}
	<div class="flex flex-col items-center justify-center py-20 text-gray-500">
		<p class="text-lg">No images yet</p>
		<p class="text-sm">Check back soon!</p>
	</div>
{:else}
	<div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
		{#each images as image (image.slug)}
			<ImageCard {image} />
		{/each}
	</div>
{/if}
