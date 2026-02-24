<script lang="ts">
	import { page } from '$app/state';
	import { getImageBySlug } from '$lib/stores/gallery.svelte';
	import { getAuth } from '$lib/stores/auth.svelte';
	import { getZapStats } from '$lib/nostr/zaps';
	import ZapButton from '$lib/components/ZapButton.svelte';
	import ImageDownload from '$lib/components/ImageDownload.svelte';
	import WalletConnect from '$lib/components/WalletConnect.svelte';
	import { onMount } from 'svelte';

	const image = $derived(getImageBySlug(page.params.slug ?? ''));
	const auth = getAuth();

	let totalSats = $state(0);
	let zapCount = $state(0);
	let purchased = $state(false);

	onMount(async () => {
		if (image?.eventId) {
			const stats = await getZapStats(image.eventId);
			totalSats = stats.totalSats;
			zapCount = stats.zapCount;
		}
	});

	function handlePurchased() {
		purchased = true;
	}
</script>

{#if image}
	<div class="mx-auto max-w-3xl">
		<a href="/" class="text-sm text-gray-400 hover:text-white transition-colors mb-4 inline-block">
			&larr; Back to gallery
		</a>

		<div class="overflow-hidden rounded-xl bg-gray-900">
			<img
				src={image.thumbnailUrl}
				alt={image.title}
				class="w-full"
			/>
		</div>

		<div class="mt-6 space-y-4">
			<div>
				<h1 class="text-2xl font-bold">{image.title}</h1>
				{#if image.description}
					<p class="mt-2 text-gray-400">{image.description}</p>
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
					{#if auth.isOwner}
						<ImageDownload {image} />
					{:else if purchased}
						<ImageDownload {image} />
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
