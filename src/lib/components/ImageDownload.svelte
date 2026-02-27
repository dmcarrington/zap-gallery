<script lang="ts">
	import type { GalleryImage } from '$lib/nostr/events';
	import { getAuth } from '$lib/stores/auth.svelte';
	import { retrieveImageUrl } from '$lib/nostr/keys';

	let { image, paymentHash = null }: { image: GalleryImage; paymentHash?: string | null } = $props();

	const auth = getAuth();

	let downloadState = $state<'idle' | 'fetching-url' | 'ready' | 'error'>('idle');
	let error = $state<string | null>(null);
	let fullResUrl = $state<string | null>(null);

	async function handleDownload() {
		error = null;

		try {
			downloadState = 'fetching-url';

			if (auth.isOwner) {
				// Owner retrieves URL directly from kind 30078 event
				const urlData = await retrieveImageUrl(image.slug);
				if (!urlData) {
					downloadState = 'error';
					error = 'Could not retrieve the full-res URL. It may not have been stored during upload.';
					return;
				}
				fullResUrl = urlData.url;
			} else {
				// Buyer calls server API which verifies zap and returns URL
				const res = await fetch(`/api/download/${image.slug}`, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						pubkey: auth.pubkey,
						eventId: image.eventId,
						priceSats: image.priceSats,
					...(paymentHash ? { paymentHash } : {})
					})
				});

				if (!res.ok) {
					downloadState = 'error';
					error =
						res.status === 402
							? 'Payment not yet confirmed on relays. Please wait a moment and try again.'
							: `Download failed: ${await res.text()}`;
					return;
				}

				const data = await res.json();
				fullResUrl = data.url;
			}

			downloadState = 'ready';
		} catch (err) {
			downloadState = 'error';
			error = err instanceof Error ? err.message : 'Failed to fetch download link';
		}
	}

	function getExtension(mimeType: string): string {
		const map: Record<string, string> = {
			'image/jpeg': 'jpg',
			'image/png': 'png',
			'image/webp': 'webp',
			'image/gif': 'gif',
			'image/tiff': 'tiff'
		};
		return map[mimeType] ?? 'jpg';
	}
</script>

{#if downloadState === 'idle'}
	<button
		onclick={handleDownload}
		class="w-full bg-green-600 hover:bg-green-700 text-white font-medium py-3 px-6 rounded-lg transition-colors cursor-pointer"
	>
		Download Full Resolution
	</button>
{:else if downloadState === 'fetching-url'}
	<div class="w-full text-center py-3 text-gray-400 text-sm">
		Fetching download link...
	</div>
{:else if downloadState === 'ready' && fullResUrl}
	<a
		href={fullResUrl}
		download="{image.slug}.{getExtension(image.mimeType)}"
		class="block w-full bg-green-600 hover:bg-green-700 text-white font-medium py-3 px-6 rounded-lg transition-colors text-center"
	>
		Save to device
	</a>
{:else if downloadState === 'error'}
	<div class="space-y-2">
		<p class="text-sm text-red-400 text-center">{error}</p>
		<button
			onclick={handleDownload}
			class="w-full bg-gray-700 hover:bg-gray-600 text-white font-medium py-2 px-4 rounded-lg transition-colors cursor-pointer text-sm"
		>
			Try again
		</button>
	</div>
{/if}
