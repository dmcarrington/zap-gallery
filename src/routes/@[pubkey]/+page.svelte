<script lang="ts">
	import { page } from '$app/state';
	import { onMount } from 'svelte';
	import { ndk } from '$lib/ndk';
	import { parseImageEvent, type GalleryImage, KIND_IMAGE_LISTING } from '$lib/nostr/events';
	import ImageCard from '$lib/components/ImageCard.svelte';
	import { GALLERY_OWNER_PUBKEY } from '$lib/config';
	import { nip19 } from 'nostr-tools';

	const pubkey = $derived(page.params.pubkey ?? '');
	const isOwner = $derived(pubkey === GALLERY_OWNER_PUBKEY);

	let images = $state<GalleryImage[]>([]);
	let loading = $state(true);
	let error = $state<string | null>(null);

	function truncatedNpub(pk: string): string {
		try {
			const npub = nip19.npubEncode(pk);
			return `${npub.slice(0, 12)}…${npub.slice(-6)}`;
		} catch {
			return `${pk.slice(0, 8)}…${pk.slice(-4)}`;
		}
	}

	onMount(async () => {
		try {
			const events = await ndk.fetchEvents({
				kinds: [KIND_IMAGE_LISTING] as number[],
				authors: [pubkey]
			});
			const list: GalleryImage[] = [];
			for (const ev of events) {
				const img = parseImageEvent(ev);
				if (img) list.push(img);
			}
			images = list.sort((a, b) => b.createdAt - a.createdAt);
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
			{isOwner ? 'Gallery owner' : truncatedNpub(pubkey)}
		</h1>
		<p class="text-gray-400 mt-1 text-sm">
			{images.length} image{images.length === 1 ? '' : 's'}
		</p>
	</header>

	{#if error}
		<div class="bg-red-500/10 border border-red-500/50 text-red-400 p-4 rounded">{error}</div>
	{:else if loading}
		<p class="text-gray-500">Loading…</p>
	{:else if images.length === 0}
		<div class="text-center py-12 bg-gray-900 border border-gray-800 rounded-lg">
			<p class="text-gray-500">No images published yet.</p>
		</div>
	{:else}
		<div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
			{#each images as image (image.eventId)}
				<ImageCard {image} />
			{/each}
		</div>
	{/if}
</div>
