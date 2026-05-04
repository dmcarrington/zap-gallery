<script lang="ts">
	import { page } from '$app/state';
	import { ndk } from '$lib/ndk';
	import { parseImageEvent, type GalleryImage, KIND_IMAGE_LISTING } from '$lib/nostr/events';
	import { getAuth } from '$lib/stores/auth.svelte';
	import { getZapStats } from '$lib/nostr/zaps';
	import ZapButton from '$lib/components/ZapButton.svelte';
	import ImageDownload from '$lib/components/ImageDownload.svelte';
	import WalletConnect from '$lib/components/WalletConnect.svelte';
	import { onMount } from 'svelte';
	import { nip19 } from 'nostr-tools';

	const auth = getAuth();
	const pubkeyParam = $derived(page.params.pubkey ?? '');
	const slugParam = $derived(page.params.slug ?? '');

	let image = $state<GalleryImage | null>(null);
	let loading = $state(true);
	let totalSats = $state(0);
	let zapCount = $state(0);
	let purchased = $state(false);
	let paymentHash = $state<string | null>(null);

	function truncatedNpub(pubkey: string): string {
		try {
			const npub = nip19.npubEncode(pubkey);
			return `${npub.slice(0, 10)}…${npub.slice(-6)}`;
		} catch {
			return `${pubkey.slice(0, 8)}…${pubkey.slice(-4)}`;
		}
	}

	onMount(async () => {
		try {
			const event = await ndk.fetchEvent({
				kinds: [KIND_IMAGE_LISTING] as number[],
				authors: [pubkeyParam],
				'#d': [slugParam]
			});
			if (event) {
				image = parseImageEvent(event);
				if (image) {
					const stats = await getZapStats(image.eventId);
					totalSats = stats.totalSats;
					zapCount = stats.zapCount;
				}
			}
		} catch (err) {
			console.error('Failed to load listing', err);
		} finally {
			loading = false;
		}
	});

	function handlePurchased(hash: string) {
		purchased = true;
		paymentHash = hash;
	}
</script>

{#if loading}
	<div class="text-center py-20">
		<p class="text-gray-500">Loading…</p>
	</div>
{:else if image}
	<div class="mx-auto max-w-3xl">
		<a href="/" class="text-sm text-gray-400 hover:text-white transition-colors mb-4 inline-block">
			&larr; Back to gallery
		</a>

		<div class="overflow-hidden rounded-xl bg-gray-900">
			<img src={image.thumbnailUrl} alt={image.title} class="w-full" />
		</div>

		<div class="mt-6 space-y-4">
			<div>
				<h1 class="text-2xl font-bold">{image.title}</h1>
				<a href="/@{image.publisherPubkey}" class="text-sm text-purple-400 hover:underline">
					by {truncatedNpub(image.publisherPubkey)}
				</a>
				{#if image.description}
					<p class="mt-2 text-gray-400">{image.description}</p>
				{/if}
				{#if image.tags.length > 0}
					<div class="flex flex-wrap gap-2 mt-2">
						{#each image.tags as tag}
							<span class="bg-gray-800 text-gray-400 text-xs px-2 py-0.5 rounded">#{tag}</span>
						{/each}
					</div>
				{/if}
			</div>

			{#if zapCount > 0}
				<div class="flex gap-4 text-sm text-gray-500">
					<span>&#9889; {zapCount} zap{zapCount !== 1 ? 's' : ''}</span>
					<span>{totalSats.toLocaleString()} sats</span>
				</div>
			{/if}

			{#if image.priceSats > 0}
				<div class="rounded-lg bg-gray-900 p-4 space-y-4">
					{#if auth.pubkey === image.publisherPubkey}
						<ImageDownload {image} />
					{:else if purchased}
						<ImageDownload {image} {paymentHash} />
					{:else}
						<p class="text-sm text-gray-400">
							Full resolution download — {image.priceSats.toLocaleString()} sats
						</p>

						{#if auth.isLoggedIn && !purchased}
							<WalletConnect />
						{/if}

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
