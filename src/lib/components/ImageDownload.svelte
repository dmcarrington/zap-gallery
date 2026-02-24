<script lang="ts">
	import type { GalleryImage } from '$lib/nostr/events';
	import { getAuth } from '$lib/stores/auth.svelte';
	import { retrieveImageUrl, fetchUrlFromDMs } from '$lib/nostr/keys';

	let { image }: { image: GalleryImage } = $props();

	const auth = getAuth();

	let downloadState = $state<'idle' | 'fetching-url' | 'ready' | 'error'>('idle');
	let error = $state<string | null>(null);
	let fullResUrl = $state<string | null>(null);

	async function handleDownload() {
		error = null;

		try {
			downloadState = 'fetching-url';

			let urlData;
			if (auth.isOwner) {
				// Owner retrieves URL directly from kind 30078 event
				urlData = await retrieveImageUrl(image.slug);
			} else {
				// Buyer fetches URL from NIP-04 DM sent by owner
				urlData = await fetchUrlFromDMs(image.slug);
			}

			if (!urlData) {
				downloadState = 'error';
				error = auth.isOwner
					? 'Could not retrieve the full-res URL. It may not have been stored during upload.'
					: 'Download link not yet delivered. The gallery owner will send it shortly — please try again in a moment.';
				return;
			}

			fullResUrl = urlData.url;
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
