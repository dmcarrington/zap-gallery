<script lang="ts">
	import { getAuth } from '$lib/stores/auth.svelte';
	import type { GalleryImage } from '$lib/nostr/events';
	import { ndk } from '$lib/ndk';
	import { NDKEvent } from '@nostr-dev-kit/ndk';
	import { BLOSSOM_SERVERS } from '$lib/config';

	const auth = getAuth();

	let images = $state<GalleryImage[]>([]);
	let loading = $state(true);
	let uploading = $state(false);
	let uploadError = $state<string | null>(null);
	let uploadSuccess = $state<string | null>(null);
	let deletingSlug = $state<string | null>(null);

	let title = $state('');
	let description = $state('');
	let price = $state('500');
	let tagInput = $state('');

	$effect(() => {
		if (auth.pubkey) loadSellerImages();
	});

	async function loadSellerImages() {
		if (!auth.pubkey) return;
		loading = true;
		try {
			const events = await ndk.fetchEvents({
				kinds: [30024],
				authors: [auth.pubkey]
			});

			const SHA256_HEX = /^[0-9a-f]{64}$/i;
			const imgs: GalleryImage[] = [];
			for (const ev of events) {
				// Skip kind-30024 events from other apps that share the kind number
				const sha = ev.tagValue('image');
				if (typeof sha !== 'string' || !SHA256_HEX.test(sha)) continue;
				imgs.push({
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
				});
			}
			images = imgs.sort((a, b) => b.publishedAt - a.publishedAt);
		} catch (err) {
			console.error('Failed to load images:', err);
		} finally {
			loading = false;
		}
	}

	async function handleUpload(e: SubmitEvent) {
		e.preventDefault();
		const form = e.target as HTMLFormElement;
		const fileInput = form.querySelector('input[type="file"]') as HTMLInputElement;
		const file = fileInput?.files?.[0];

		if (!file) {
			uploadError = 'Select an image file';
			return;
		}

		uploading = true;
		uploadError = null;
		uploadSuccess = null;

		try {
			const authEvent = new NDKEvent(ndk);
			authEvent.kind = 27235; // NIP-98 HTTP Auth
			authEvent.content = '';
			authEvent.tags = [
				['u', `${window.location.protocol}//${window.location.host}/api/upload`],
				['method', 'POST'],
				['created_at', String(Math.floor(Date.now() / 1000))]
			];
			await authEvent.sign();

			const formData = new FormData();
			formData.append('file', file);
			formData.append('title', title);
			formData.append('description', description);
			formData.append('price', price);
			if (tagInput) formData.append('tags', tagInput);

			const res = await fetch('/api/upload', {
				method: 'POST',
				body: formData,
				headers: {
					'x-nostr-pubkey': authEvent.pubkey,
					'x-nostr-event-id': authEvent.id,
					'x-nostr-signature': authEvent.sig || ''
				}
			});

			if (!res.ok) {
				const data = await res.json().catch(() => ({ message: res.statusText }));
				throw new Error(data.message || 'Upload failed');
			}

			const result = await res.json();
			uploadSuccess = `"${title}" published! Slug: ${result.slug}`;

			title = '';
			description = '';
			price = '500';
			tagInput = '';
			fileInput.value = '';

			await loadSellerImages();
		} catch (err) {
			uploadError = err instanceof Error ? err.message : 'Upload failed';
		} finally {
			uploading = false;
		}
	}

	async function deleteImage(image: GalleryImage) {
		if (!confirm(`Delete "${image.title}"? This cannot be undone.`)) return;
		if (!image.eventId) return;

		deletingSlug = image.slug;
		try {
			const deleteEvent = new NDKEvent(ndk);
			deleteEvent.kind = 5;
			deleteEvent.content = '';
			deleteEvent.tags = [
				['e', image.eventId],
				['k', '30024']
			];
			await deleteEvent.sign();
			await deleteEvent.publish();

			images = images.filter(i => i.eventId !== image.eventId);
		} catch (err) {
			console.error('Failed to delete:', err);
		} finally {
			deletingSlug = null;
		}
	}

	function formatSize(bytes: number): string {
		if (bytes < 1024) return `${bytes} B`;
		if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
		return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
	}
</script>

<div class="container mx-auto px-4 py-8 max-w-4xl">
	{#if !auth.isLoggedIn}
		<div class="text-center py-12">
			<h1 class="text-2xl font-bold text-white mb-2">Admin</h1>
			<p class="text-gray-400">Sign in with Nostr to manage your gallery.</p>
		</div>
	{:else}
		<h1 class="text-2xl font-bold text-white mb-2">Admin</h1>
		<p class="text-gray-400 text-sm mb-8">
			Upload high-res photos, set a price in sats, and buyers pay via Lightning.
			{#if !auth.isPro}
				<a href="/pro" class="text-purple-400 hover:underline">Upgrade to Pro</a> for unlimited uploads and zero platform fees.
			{/if}
		</p>

		<div class="bg-gray-900 border border-gray-800 rounded-lg p-6 mb-8">
			<h2 class="text-lg font-semibold text-white mb-4">Upload New Image</h2>

			<form onsubmit={handleUpload} class="space-y-4">
				<div>
					<label class="block text-sm text-gray-400 mb-1">Image File</label>
					<input
						type="file"
						accept="image/jpeg,image/png,image/webp,image/gif,image/avif"
						required
						class="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white text-sm cursor-pointer file:mr-3 file:py-1 file:px-3 file:rounded file:border-0 file:bg-gray-700 file:text-white file:cursor-pointer file:text-sm"
					/>
				</div>

				<div class="grid grid-cols-1 md:grid-cols-2 gap-4">
					<div>
						<label class="block text-sm text-gray-400 mb-1">Title</label>
						<input
							type="text"
							bind:value={title}
							required
							placeholder="Sunset over the Atlantic"
							class="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white text-sm focus:border-purple-500 outline-none"
						/>
					</div>
					<div>
						<label class="block text-sm text-gray-400 mb-1">Price (sats)</label>
						<input
							type="number"
							bind:value={price}
							required
							min="1"
							placeholder="500"
							class="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white text-sm focus:border-purple-500 outline-none"
						/>
					</div>
				</div>

				<div>
					<label class="block text-sm text-gray-400 mb-1">Description</label>
					<textarea
						bind:value={description}
						rows="3"
						placeholder="Describe your photo..."
						class="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white text-sm focus:border-purple-500 outline-none resize-y"
					></textarea>
				</div>

				<div>
					<label class="block text-sm text-gray-400 mb-1">Tags (comma-separated)</label>
					<input
						type="text"
						bind:value={tagInput}
						placeholder="landscape, sunset, beach"
						class="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white text-sm focus:border-purple-500 outline-none"
					/>
				</div>

				{#if uploadError}
					<div class="text-sm text-red-400">{uploadError}</div>
				{/if}
				{#if uploadSuccess}
					<div class="text-sm text-green-400">{uploadSuccess}</div>
				{/if}

				<button
					type="submit"
					disabled={uploading || !auth.pubkey}
					class="w-full bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white font-medium py-2 px-4 rounded-lg transition-colors cursor-pointer"
				>
					{uploading ? 'Uploading...' : 'Publish Image'}
				</button>
			</form>
		</div>

		<h2 class="text-lg font-semibold text-white mb-4">
			Your Published Images ({images.length})
			{#if !auth.isPro && images.length >= 10}
				<span class="text-sm text-amber-400 ml-2">Free tier limit reached</span>
			{/if}
		</h2>

		{#if loading}
			<div class="text-center py-8">
				<p class="text-gray-500">Loading your images...</p>
			</div>
		{:else if images.length === 0}
			<div class="text-center py-8 bg-gray-900 border border-gray-800 rounded-lg">
				<p class="text-gray-500">No images published yet. Upload your first one above.</p>
			</div>
		{:else}
			<div class="space-y-3">
				{#each images as image (image.eventId)}
					<div class="bg-gray-900 border border-gray-800 rounded-lg p-4 flex items-center gap-4">
						{#if image.sha256}
							<img
								src={`${BLOSSOM_SERVERS[0]}/${image.sha256}`}
								alt={image.title}
								class="w-16 h-16 object-cover rounded border border-gray-700"
							/>
						{/if}
						<div class="flex-1 min-w-0">
							<a
								href={`/image/${image.slug}`}
								class="text-white font-medium hover:text-purple-400 transition-colors truncate block"
							>
								{image.title}
							</a>
							<div class="flex items-center gap-3 text-xs text-gray-500 mt-1">
								<span>{image.priceSats.toLocaleString()} sats</span>
								{#if image.size}
									<span>{formatSize(image.size)}</span>
								{/if}
								{#if image.publishedAt}
									<span>{new Date(image.publishedAt * 1000).toLocaleDateString('en-GB')}</span>
								{/if}
								{#if image.tags?.length}
									<span class="text-gray-600">|</span>
									{#each image.tags as tag}
										<span class="bg-gray-800 px-1.5 py-0.5 rounded text-gray-500">#{tag}</span>
									{/each}
								{/if}
							</div>
						</div>
						<button
							onclick={() => deleteImage(image)}
							disabled={deletingSlug === image.slug}
							class="text-gray-600 hover:text-red-400 disabled:opacity-50 text-sm cursor-pointer transition-colors px-2 py-1 rounded"
						>
							{deletingSlug === image.slug ? '...' : 'Delete'}
						</button>
					</div>
				{/each}
			</div>
		{/if}
	{/if}
</div>
