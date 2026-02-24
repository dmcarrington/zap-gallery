<script lang="ts">
	import { getGallery } from '$lib/stores/gallery.svelte';
	import { fetchZapReceipts, type ZapReceipt } from '$lib/nostr/zaps';
	import { retrieveImageUrl, sendUrlToBuyer } from '$lib/nostr/keys';
	import type { GalleryImage } from '$lib/nostr/events';
	import { onMount } from 'svelte';
	import { nip19 } from 'nostr-tools';

	const gallery = getGallery();

	let autoDeliver = $state(true);
	let deliveryLog = $state<Array<{ buyer: string; slug: string; time: number; status: 'sent' | 'error' }>>([]);
	let pendingZaps = $state<Array<{ receipt: ZapReceipt; image: GalleryImage }>>([]);
	let processing = $state(new Set<string>());
	let loadingZaps = $state(false);

	// Track which buyer+image combos we've already delivered URLs to
	const deliveredUrls = new Set<string>();

	onMount(() => {
		loadPendingZaps();
		// Poll for new zaps every 30 seconds
		const interval = setInterval(loadPendingZaps, 30000);
		return () => clearInterval(interval);
	});

	async function loadPendingZaps() {
		if (gallery.images.length === 0) return;
		loadingZaps = true;

		const allPending: Array<{ receipt: ZapReceipt; image: GalleryImage }> = [];

		for (const image of gallery.images) {
			if (!image.eventId || !image.priceSats) continue;

			try {
				const receipts = await fetchZapReceipts(image.eventId);
				for (const receipt of receipts) {
					if (receipt.amountSats >= image.priceSats) {
						const deliveryId = `${receipt.senderPubkey}:${image.slug}`;
						if (!deliveredUrls.has(deliveryId)) {
							allPending.push({ receipt, image });

							// Auto-deliver if enabled
							if (autoDeliver) {
								deliverUrl(receipt, image);
							}
						}
					}
				}
			} catch {
				// Skip failed fetches
			}
		}

		pendingZaps = allPending;
		loadingZaps = false;
	}

	async function deliverUrl(receipt: ZapReceipt, image: GalleryImage) {
		const deliveryId = `${receipt.senderPubkey}:${image.slug}`;
		if (deliveredUrls.has(deliveryId) || processing.has(deliveryId)) return;

		processing = new Set([...processing, deliveryId]);

		try {
			const urlData = await retrieveImageUrl(image.slug);
			if (!urlData) {
				deliveryLog = [{
					buyer: receipt.senderPubkey,
					slug: image.slug,
					time: Date.now(),
					status: 'error'
				}, ...deliveryLog];
				return;
			}

			await sendUrlToBuyer(receipt.senderPubkey, urlData);

			deliveredUrls.add(deliveryId);
			deliveryLog = [{
				buyer: receipt.senderPubkey,
				slug: image.slug,
				time: Date.now(),
				status: 'sent'
			}, ...deliveryLog];

			// Remove from pending
			pendingZaps = pendingZaps.filter(
				(p) => !(p.receipt.senderPubkey === receipt.senderPubkey && p.image.slug === image.slug)
			);
		} catch {
			deliveryLog = [{
				buyer: receipt.senderPubkey,
				slug: image.slug,
				time: Date.now(),
				status: 'error'
			}, ...deliveryLog];
		} finally {
			const next = new Set(processing);
			next.delete(deliveryId);
			processing = next;
		}
	}

	function truncatedNpub(pubkey: string): string {
		const npub = nip19.npubEncode(pubkey);
		return `${npub.slice(0, 12)}...${npub.slice(-4)}`;
	}
</script>

<div class="space-y-6">
	<div class="flex items-center justify-between">
		<h1 class="text-2xl font-bold">Admin Dashboard</h1>
		<a
			href="/admin/upload"
			class="bg-purple-600 hover:bg-purple-700 text-white font-medium px-4 py-2 rounded-lg transition-colors"
		>
			Upload Image
		</a>
	</div>

	<!-- URL delivery controls -->
	<div class="rounded-lg bg-gray-900 p-4 space-y-3">
		<div class="flex items-center justify-between">
			<h2 class="font-medium">Download Delivery</h2>
			<label class="flex items-center gap-2 text-sm cursor-pointer">
				<input type="checkbox" bind:checked={autoDeliver} class="accent-purple-500" />
				<span class="text-gray-300">Auto-deliver</span>
			</label>
		</div>

		{#if loadingZaps}
			<p class="text-sm text-gray-500">Checking for new zaps...</p>
		{:else if pendingZaps.length > 0}
			<div class="space-y-2">
				{#each pendingZaps as { receipt, image }}
					{@const deliveryId = `${receipt.senderPubkey}:${image.slug}`}
					<div class="flex items-center justify-between rounded bg-gray-800 p-2 text-sm">
						<div>
							<span class="text-gray-300">{truncatedNpub(receipt.senderPubkey)}</span>
							<span class="text-gray-500">zapped</span>
							<span class="text-white">{image.title}</span>
							<span class="text-yellow-400">({receipt.amountSats} sats)</span>
						</div>
						{#if processing.has(deliveryId)}
							<span class="text-gray-500 text-xs">Sending...</span>
						{:else}
							<button
								onclick={() => deliverUrl(receipt, image)}
								class="text-purple-400 hover:text-purple-300 text-xs cursor-pointer"
							>
								Send link
							</button>
						{/if}
					</div>
				{/each}
			</div>
		{:else}
			<p class="text-sm text-gray-500">No pending deliveries</p>
		{/if}

		{#if deliveryLog.length > 0}
			<div class="border-t border-gray-800 pt-2 mt-2">
				<h3 class="text-xs text-gray-500 mb-1">Recent deliveries</h3>
				{#each deliveryLog.slice(0, 10) as entry}
					<div class="text-xs text-gray-500 py-0.5">
						<span class={entry.status === 'sent' ? 'text-green-400' : 'text-red-400'}>
							{entry.status === 'sent' ? 'Sent' : 'Failed'}
						</span>
						link for <span class="text-gray-300">{entry.slug}</span>
						to <span class="text-gray-300">{truncatedNpub(entry.buyer)}</span>
					</div>
				{/each}
			</div>
		{/if}
	</div>

	<!-- Image list -->
	<div>
		<h2 class="font-medium mb-3">Gallery Images ({gallery.images.length})</h2>
		{#if gallery.images.length === 0}
			<div class="text-center py-12 text-gray-500">
				<p class="text-lg">No images uploaded yet</p>
				<a href="/admin/upload" class="text-purple-400 hover:text-purple-300 mt-2 inline-block">
					Upload your first image
				</a>
			</div>
		{:else}
			<div class="space-y-2">
				{#each gallery.images as image (image.slug)}
					<div class="flex items-center gap-4 rounded-lg bg-gray-900 p-3">
						<img
							src={image.thumbnailUrl}
							alt={image.title}
							class="h-16 w-16 rounded object-cover"
						/>
						<div class="flex-1 min-w-0">
							<h3 class="font-medium truncate">{image.title}</h3>
							<p class="text-sm text-yellow-400">
								&#9889; {image.priceSats.toLocaleString()} sats
							</p>
						</div>
						<a
							href="/image/{image.slug}"
							class="text-sm text-gray-400 hover:text-white transition-colors"
						>
							View
						</a>
					</div>
				{/each}
			</div>
		{/if}
	</div>
</div>
