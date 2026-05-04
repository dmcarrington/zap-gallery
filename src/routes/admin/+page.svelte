<script lang="ts">
	import { getAuth } from '$lib/stores/auth.svelte';
	import { ndk } from '$lib/ndk';
	import { NDKEvent } from '@nostr-dev-kit/ndk';
	import { parseImageEvent, type GalleryImage, KIND_IMAGE_LISTING } from '$lib/nostr/events';
	import { uploadAndPublish } from '$lib/upload';
	import { FREE_UPLOAD_LIMIT } from '$lib/config';
	import { nip19 } from 'nostr-tools';

	const auth = getAuth();

	const myNpub = $derived(auth.pubkey ? safeNpub(auth.pubkey) : null);

	function safeNpub(pk: string): string | null {
		try {
			return nip19.npubEncode(pk);
		} catch {
			return null;
		}
	}

	let images = $state<GalleryImage[]>([]);
	let loading = $state(true);
	let uploading = $state(false);
	let uploadError = $state<string | null>(null);
	let uploadSuccess = $state<string | null>(null);
	let deletingEventId = $state<string | null>(null);

	let title = $state('');
	let description = $state('');
	let price = $state('500');
	let tagInput = $state('');
	let fileInputEl: HTMLInputElement | null = $state(null);

	const atFreeLimit = $derived(!auth.isPro && images.length >= FREE_UPLOAD_LIMIT);

	$effect(() => {
		if (auth.pubkey) loadOwnImages();
	});

	async function loadOwnImages() {
		if (!auth.pubkey) return;
		loading = true;
		try {
			const events = await ndk.fetchEvents({
				kinds: [KIND_IMAGE_LISTING] as number[],
				authors: [auth.pubkey]
			});
			const list: GalleryImage[] = [];
			for (const ev of events) {
				const img = parseImageEvent(ev);
				if (img) list.push(img);
			}
			images = list.sort((a, b) => b.createdAt - a.createdAt);
		} catch (err) {
			console.error('Failed to load images', err);
		} finally {
			loading = false;
		}
	}

	async function handleUpload(e: SubmitEvent) {
		e.preventDefault();
		uploadError = null;
		uploadSuccess = null;

		const file = fileInputEl?.files?.[0];
		if (!file) {
			uploadError = 'Choose an image file.';
			return;
		}
		const priceSats = parseInt(price, 10);
		if (!Number.isFinite(priceSats) || priceSats < 1) {
			uploadError = 'Price must be at least 1 sat.';
			return;
		}

		uploading = true;
		try {
			const tags = tagInput
				.split(',')
				.map((t) => t.trim())
				.filter(Boolean);
			const res = await uploadAndPublish({
				file,
				title: title.trim() || file.name,
				description: description.trim(),
				priceSats,
				tags
			});
			uploadSuccess = `Published "${title || file.name}" — slug ${res.slug}`;
			title = '';
			description = '';
			price = '500';
			tagInput = '';
			if (fileInputEl) fileInputEl.value = '';
			await loadOwnImages();
		} catch (err) {
			uploadError = err instanceof Error ? err.message : 'Upload failed';
		} finally {
			uploading = false;
		}
	}

	async function deleteListing(image: GalleryImage) {
		if (!confirm(`Delete "${image.title}"? This publishes a deletion event; the file may remain on Blossom.`)) return;
		deletingEventId = image.eventId;
		try {
			const ev = new NDKEvent(ndk);
			ev.kind = 5;
			ev.content = 'Image removed';
			ev.tags = [
				['e', image.eventId],
				['a', `${KIND_IMAGE_LISTING}:${image.publisherPubkey}:${image.slug}`]
			];
			await ev.publish();
			images = images.filter((i) => i.eventId !== image.eventId);
		} catch (err) {
			console.error('Failed to delete', err);
			alert('Delete failed — see console.');
		} finally {
			deletingEventId = null;
		}
	}

	function formatSize(bytes: number): string {
		if (!bytes) return '';
		if (bytes < 1024) return `${bytes} B`;
		if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
		return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
	}
</script>

<div class="container mx-auto px-4 py-8 max-w-4xl">
	<div class="flex items-baseline justify-between gap-4 mb-2">
		<h1 class="text-2xl font-bold text-white">Admin</h1>
		{#if myNpub}
			<a href="/{myNpub}" class="text-sm text-purple-400 hover:underline">View public gallery →</a>
		{/if}
	</div>

	{#if !auth.isLoggedIn}
		<p class="text-gray-400">Log in with Nostr above to manage your gallery.</p>
	{:else}
		<p class="text-gray-400 text-sm mb-6">
			{#if auth.isPro}
				<span class="text-purple-400 font-medium">Pro ⚡</span> — unlimited uploads.
			{:else}
				Free tier — up to {FREE_UPLOAD_LIMIT} listing{FREE_UPLOAD_LIMIT === 1 ? '' : 's'}.
				<a href="/pro" class="text-purple-400 hover:underline">Upgrade to Pro</a> to remove the limit.
			{/if}
		</p>

		<section class="bg-gray-900 border border-gray-800 rounded-lg p-6 mb-8">
			<h2 class="text-lg font-semibold text-white mb-4">Upload new image</h2>
			{#if atFreeLimit}
				<div class="bg-amber-500/10 border border-amber-500/40 text-amber-200 text-sm p-3 rounded mb-4">
					You've used the free-tier limit ({FREE_UPLOAD_LIMIT}). Delete an existing listing or
					<a href="/pro" class="underline hover:text-amber-100">upgrade to Pro</a> to add more.
				</div>
			{/if}
			<form onsubmit={handleUpload} class="space-y-4">
				<div>
					<label for="file" class="block text-sm text-gray-400 mb-1">Image file</label>
					<input
						id="file"
						bind:this={fileInputEl}
						type="file"
						accept="image/jpeg,image/png,image/webp,image/avif"
						required
						disabled={atFreeLimit}
						class="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white text-sm cursor-pointer file:mr-3 file:py-1 file:px-3 file:rounded file:border-0 file:bg-gray-700 file:text-white file:cursor-pointer file:text-sm disabled:opacity-50"
					/>
				</div>
				<div class="grid grid-cols-1 md:grid-cols-2 gap-4">
					<div>
						<label for="title" class="block text-sm text-gray-400 mb-1">Title</label>
						<input
							id="title"
							type="text"
							bind:value={title}
							required
							disabled={atFreeLimit}
							placeholder="Sunset over the Atlantic"
							class="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white text-sm focus:border-purple-500 outline-none disabled:opacity-50"
						/>
					</div>
					<div>
						<label for="price" class="block text-sm text-gray-400 mb-1">Price (sats)</label>
						<input
							id="price"
							type="number"
							bind:value={price}
							required
							min="1"
							disabled={atFreeLimit}
							class="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white text-sm focus:border-purple-500 outline-none disabled:opacity-50"
						/>
					</div>
				</div>
				<div>
					<label for="description" class="block text-sm text-gray-400 mb-1">Description</label>
					<textarea
						id="description"
						bind:value={description}
						rows="3"
						disabled={atFreeLimit}
						placeholder="Describe your photo…"
						class="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white text-sm focus:border-purple-500 outline-none resize-y disabled:opacity-50"
					></textarea>
				</div>
				<div>
					<label for="image-tags" class="block text-sm text-gray-400 mb-1">Tags (comma separated)</label>
					<input
						id="image-tags"
						type="text"
						bind:value={tagInput}
						disabled={atFreeLimit}
						placeholder="landscape, sunset, beach"
						class="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white text-sm focus:border-purple-500 outline-none disabled:opacity-50"
					/>
				</div>
				{#if uploadError}
					<p class="text-sm text-red-400">{uploadError}</p>
				{/if}
				{#if uploadSuccess}
					<p class="text-sm text-green-400">{uploadSuccess}</p>
				{/if}
				<button
					type="submit"
					disabled={uploading || atFreeLimit}
					class="w-full bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white font-medium py-2 px-4 rounded-lg transition-colors cursor-pointer"
				>
					{uploading ? 'Uploading…' : 'Publish'}
				</button>
			</form>
		</section>

		<section>
			<h2 class="text-lg font-semibold text-white mb-4">
				Your listings ({images.length})
			</h2>
			{#if loading}
				<p class="text-gray-500">Loading…</p>
			{:else if images.length === 0}
				<div class="text-center py-8 bg-gray-900 border border-gray-800 rounded-lg">
					<p class="text-gray-500">No listings yet. Upload your first one above.</p>
				</div>
			{:else}
				<div class="space-y-3">
					{#each images as image (image.eventId)}
						<div class="bg-gray-900 border border-gray-800 rounded-lg p-4 flex items-center gap-4">
							{#if image.thumbnailUrl}
								<img
									src={image.thumbnailUrl}
									alt={image.title}
									class="w-16 h-16 object-cover rounded border border-gray-700"
								/>
							{/if}
							<div class="flex-1 min-w-0">
								<a
									href={`/image/${image.publisherPubkey}/${image.slug}`}
									class="text-white font-medium hover:text-purple-400 truncate block"
								>
									{image.title}
								</a>
								<div class="flex items-center gap-3 text-xs text-gray-500 mt-1 flex-wrap">
									<span>{image.priceSats.toLocaleString()} sats</span>
									{#if image.size}<span>{formatSize(image.size)}</span>{/if}
									{#if image.createdAt}
										<span>{new Date(image.createdAt * 1000).toLocaleDateString('en-GB')}</span>
									{/if}
									{#each image.tags as tag}
										<span class="bg-gray-800 px-1.5 py-0.5 rounded text-gray-500">#{tag}</span>
									{/each}
								</div>
							</div>
							<button
								onclick={() => deleteListing(image)}
								disabled={deletingEventId === image.eventId}
								class="text-gray-600 hover:text-red-400 disabled:opacity-50 text-sm cursor-pointer transition-colors px-2 py-1 rounded"
							>
								{deletingEventId === image.eventId ? '…' : 'Delete'}
							</button>
						</div>
					{/each}
				</div>
			{/if}
		</section>
	{/if}
</div>
