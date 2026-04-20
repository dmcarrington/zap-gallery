<script lang="ts">
	import { onMount } from 'svelte';
	import { ZapGallerySDK } from 'zap-gallery-sdk';
	import { GALLERY_OWNER_PUBKEY, RELAY_URLS, BLOSSOM_SERVERS } from '$lib/config';
	import ImageCard from '$lib/components/ImageCard.svelte';

	// Get pubkey from URL param
	export let pubkey: string;

	let gallery: ZapGallerySDK | null = null;
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

			gallery = new ZapGallerySDK({
				galleryOwnerPubkey: GALLERY_OWNER_PUBKEY,
				relayUrls: RELAY_URLS,
				blossom: {
					serverUrls: BLOSSOM_SERVERS.split(','),
					maxFileSizeMB: 20
				}
			});

			await gallery.connect();
			gallery.subscribe();

			// Check if this user has Pro status
			// Pro status is stored in Nostr app data (kind 30078)
			// For now, just use URL param flag
			if (isPro) {
				console.log('Pro user detected');
			}
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
			{#if isPro}
				<span class="inline-block mt-3 px-3 py-1 bg-amber-500 text-black text-sm font-bold rounded">
					Pro Tier
				</span>
			{/if}
		</header>

		{#if error}
			<div class="bg-red-500/10 border border-red-500/50 text-red-500 p-4 rounded">
				{error}
			</div>
		{/if}

		{#if gallery && gallery.images.length > 0}
			<div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
				{#each gallery.images as image}
					<ImageCard {image} {isPro} />
				{/each}
			</div>
		{:else if !error}
			<p class="text-gray-500 italic">Loading gallery...</p>
		{/if}
	</div>
</div>

<style>
	:global(body) {
		background-color: #000;
	}
</style>
