<script lang="ts">
	import { page } from '$app/stores';
	import { ndk } from '$lib/ndk';
	import { getAuth } from '$lib/stores/auth.svelte';
	import ZapButton from '$lib/components/ZapButton.svelte';
	import ImageDownload from '$lib/components/ImageDownload.svelte';
	import { onMount } from 'svelte';
	import type { GalleryImage } from '$lib/nostr/events';
	import { BLOSSOM_SERVERS } from '$lib/config';

	const { params } = $page;
	const slug = $derived(params.slug ?? '');
	const auth = getAuth();

	let image = $state<GalleryImage | null>(null);
	let loading = $state(true);
	let purchased = $state(false);

	onMount(async () => {
		try {
			// Fetch the kind 30024 listing for this slug
			const events = await ndk.fetchEvents({
				kinds: [30024],
				'#d': [slug]
			});

			for (const ev of events) {
				image = {
					eventId: ev.id,
					title: ev.tagValue('title') || 'Untitled',
					description: ev.content || '',
					priceSats: Number(ev.tagValue('price') || 0),
					slug: ev.tagValue('d') || '',
					sha256: ev.tagValue('image') || undefined,
					mimeType: ev.tagValue('m') || undefined,
					size: Number(ev.tagValue('size') || 0),
					publisherPubkey: ev.pubkey,
					publishedAt: Number(ev.tagValue('published_at') || 0),
					tags: ev.getMatchingTags('t').map(t => t[1])
				};
				break; // first match
			}
		} catch (err) {
			console.error('Failed to load image:', err);
		} finally {
			loading = false;
		}
	});

	function handlePurchased(_hash: string) {
		purchased = true;
	}
</script>

{#if loading}
	<div class="text-center py-20">
		<p class="text-gray-500">Loading...</p>
	</div>
{:else if image}
	<div class="mx-auto max-w-3xl">
		<a href="/" class="text-sm text-gray-400 hover:text-white transition-colors mb-4 inline-block">
			&larr; Back to gallery
		</a>

		<div class="overflow-hidden rounded-xl bg-gray-900">
			{#if image.sha256}
				<img
					src={`${BLOSSOM_SERVERS[0]}/${image.sha256}`}
					alt={image.title}
					class="w-full"
				/>
			{/if}
		</div>

		<div class="mt-6 space-y-4">
			<div>
				<h1 class="text-2xl font-bold">{image.title}</h1>
				{#if image.publisherPubkey}
					<a href="/@{image.publisherPubkey}" class="text-sm text-purple-400 hover:underline">
						by {image.publisherPubkey.slice(0, 8)}...{image.publisherPubkey.slice(-4)}
					</a>
				{/if}
				{#if image.description}
					<p class="mt-2 text-gray-400">{image.description}</p>
				{/if}
				{#if image.tags && image.tags.length > 0}
					<div class="flex gap-2 mt-2">
						{#each image.tags as tag}
							<span class="bg-gray-800 text-gray-400 text-xs px-2 py-0.5 rounded">#{tag}</span>
						{/each}
					</div>
				{/if}
			</div>

			{#if image.priceSats > 0}
				<div class="rounded-lg bg-gray-900 p-4 space-y-4">
					{#if auth.isOwner}
						<ImageDownload {image} />
					{:else if purchased}
						<ImageDownload {image} />
					{:else}
						<p class="text-sm text-gray-400">
							Full resolution download — {image.priceSats.toLocaleString()} sats
						</p>

						<ZapButton {image} onPurchased={handlePurchased} />
					{/if}
				</div>
			{/if}
		</div>
	</div>
{:else}
	<div class="text-center py-20">
		<h1 class="text-2xl font-bold text-gray-400">Image not found</h1>
		<a href="/" class="text-purple-400 hover:text-purple-300 mt-4 inline-block">
			Back to gallery
		</a>
	</div>
{/if}
