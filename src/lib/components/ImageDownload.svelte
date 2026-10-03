<script lang="ts">
	import type { GalleryImage } from '$lib/nostr/events';
	import { getAuth } from '$lib/stores/auth.svelte';
	import { retrieveOwnImageSecret, type ImageSecret } from '$lib/nostr/keys';
	import { decryptBlob } from '$lib/crypto';
	import { onDestroy } from 'svelte';

	let { image, token = null }: { image: GalleryImage; token?: string | null } = $props();

	const auth = getAuth();

	let downloadState = $state<'idle' | 'fetching-url' | 'decrypting' | 'ready' | 'error'>('idle');
	let error = $state<string | null>(null);
	let fullResUrl = $state<string | null>(null);
	let objectUrl: string | null = null;

	onDestroy(() => {
		if (objectUrl) URL.revokeObjectURL(objectUrl);
	});

	/** Seller reads their own kind 30078 secret; legacy listings carry a public URL. */
	async function fetchOwnSecret(): Promise<ImageSecret | null> {
		const secret = await retrieveOwnImageSecret(image.slug, image.publisherPubkey);
		if (secret) return secret;
		if (image.fullResUrl) {
			return { slug: image.slug, url: image.fullResUrl, mimeType: image.mimeType };
		}
		return null;
	}

	async function handleDownload() {
		error = null;

		try {
			downloadState = 'fetching-url';

			let secret: Pick<ImageSecret, 'url' | 'key' | 'mimeType'> | null;

			if (auth.pubkey === image.publisherPubkey) {
				secret = await fetchOwnSecret();
				if (!secret) {
					downloadState = 'error';
					error = 'Could not retrieve the image key. It may not have been stored during upload.';
					return;
				}
			} else {
				// Buyer calls server API which verifies payment and returns the key
				const res = await fetch(`/api/download/${image.slug}`, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						pubkey: auth.pubkey,
						sellerPubkey: image.publisherPubkey,
						...(token ? { token } : {})
					})
				});

				if (!res.ok) {
					downloadState = 'error';
					error =
						res.status === 402
							? 'Payment not yet confirmed. Please wait a moment and try again.'
							: `Download failed: ${await res.text()}`;
					return;
				}

				secret = await res.json();
			}

			if (!secret) return;

			if (secret.key) {
				// Fetch the ciphertext from Blossom and decrypt it in the browser
				downloadState = 'decrypting';
				const res = await fetch(secret.url);
				if (!res.ok) throw new Error(`Could not fetch the image file (${res.status})`);
				const blob = await decryptBlob(
					await res.arrayBuffer(),
					secret.key,
					secret.mimeType || image.mimeType
				);
				if (objectUrl) URL.revokeObjectURL(objectUrl);
				objectUrl = URL.createObjectURL(blob);
				fullResUrl = objectUrl;
			} else {
				// Legacy unencrypted upload
				fullResUrl = secret.url;
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
{:else if downloadState === 'decrypting'}
	<div class="w-full text-center py-3 text-gray-400 text-sm">
		Downloading and decrypting...
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
