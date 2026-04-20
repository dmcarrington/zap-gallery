<script lang="ts">
	import { onMount } from 'svelte';
	import { getGallery } from '$lib/stores/gallery.svelte';
	import { GALLERY_OWNER_PUBKEY } from '$lib/config';
	import ImageCard from '$lib/components/ImageCard.svelte';

	// Get pubkey from URL param
	export let pubkey: string;
	const isOwner = pubkey === GALLERY_OWNER_PUBKEY;

	const gallery = getGallery();
	let error: string | null = null;

	// Check if Pro user
	const searchParams = new URLSearchParams(window.location.search);
	const isPro = searchParams.get('pro') === '1';

	onMount(async () => {
		try {
			if (!GALLERY_OWNER_PUBKEY) {
				error = 'Gallery owner pubkey not configured';
				return;
			}

			// Subscribe to gallery updates
			gallery.subscribe();
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to load gallery';
		}
	});
</script>

<div class="min-h-screen bg-gray-900 text-white">
	<div class="container mx-auto px-4 py-8">
		<header class="mb-8">
			<h1 class="text-3xl font-bold">Nostr Zap Gallery</h1>
			<p class="text-gray-400 mt-2">
				Browse images and send zaps to unlock full-resolution downloads.
			</p>
			<span class="inline-block mt-3 px-3 py-1 bg-gray-600 text-sm text-gray-300 rounded">
				Viewing: @
			</span>
			{#if isOwner}
				<span class="inline-block mt-3 px-3 py-1 bg-amber-500 text-black text-sm font-bold rounded ml-2">
					Owner
				</span>
				<a href="/admin" class="mt-3 inline-block bg-amber-500 text-black px-4 py-2 rounded font-medium hover:bg-amber-400">
					Owner Dashboard
				</a>
			{/if}
		</header>

		{#if error}
			<div class="bg-red-500/10 border border-red-500/50 text-red-500 p-4 rounded">
				{error}
			</div>
		{/if}

		{#if gallery.images.length > 0}
			<div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
				{#each gallery.images as image}
					<ImageCard {image} {isPro} />
				{/each}
			</div>
		{:else if !gallery.loading}
			<p class="text-gray-500 italic">Loading gallery...</p>
		{/if}
	</div>
</div>

<style>
	:global(body) {
		background-color: #000;
	}
</style>
