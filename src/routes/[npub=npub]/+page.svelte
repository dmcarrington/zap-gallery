<script lang="ts">
	import { page } from '$app/state';
	import { onMount } from 'svelte';
	import { nip19 } from 'nostr-tools';
	import { ndk } from '$lib/ndk';
	import { parseImageEvent, type GalleryImage, KIND_IMAGE_LISTING } from '$lib/nostr/events';
	import ImageGrid from '$lib/components/ImageGrid.svelte';
	import { getAuth } from '$lib/stores/auth.svelte';

	const auth = getAuth();

	const npub = $derived(page.params.npub ?? '');
	const pubkey = $derived(decodeNpub(npub));
	const isMine = $derived(!!pubkey && pubkey === auth.pubkey);

	function decodeNpub(value: string): string | null {
		try {
			const decoded = nip19.decode(value);
			return decoded.type === 'npub' ? (decoded.data as string) : null;
		} catch {
			return null;
		}
	}

	function shortNpub(v: string): string {
		return `${v.slice(0, 12)}…${v.slice(-6)}`;
	}

	let images = $state<GalleryImage[]>([]);
	let loading = $state(true);
	let loaded = $state(false);
	let error = $state<string | null>(null);

	onMount(async () => {
		if (!pubkey) {
			error = 'Invalid npub';
			loading = false;
			return;
		}
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
			loaded = true;
		}
	});
</script>

<div class="container mx-auto px-4 py-8">
	<header class="mb-6">
		<h1 class="text-2xl font-bold text-white">
			{isMine ? 'Your gallery' : shortNpub(npub)}
		</h1>
		{#if !isMine}
			<p class="text-xs text-gray-500 font-mono mt-1">{npub}</p>
		{/if}
		<p class="text-gray-400 text-sm mt-2">
			{images.length} image{images.length === 1 ? '' : 's'}
			{#if isMine}
				· <a href="/admin" class="text-purple-400 hover:underline">Manage in admin</a>
			{/if}
		</p>
	</header>

	{#if error}
		<div class="bg-red-500/10 border border-red-500/50 text-red-400 p-4 rounded">{error}</div>
	{:else}
		<ImageGrid {images} loading={loading && !loaded} />
	{/if}
</div>
