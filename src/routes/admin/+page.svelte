<script lang="ts">
	import { getGallery, deleteImage } from '$lib/stores/gallery.svelte';
	import type { GalleryImage } from '$lib/nostr/events';

	const gallery = getGallery();

	let deleting = $state<string | null>(null);
	let confirmSlug = $state<string | null>(null);

	async function handleDelete(image: GalleryImage) {
		if (confirmSlug !== image.slug) {
			confirmSlug = image.slug;
			return;
		}
		deleting = image.slug;
		try {
			await deleteImage(image);
		} finally {
			deleting = null;
			confirmSlug = null;
		}
	}

	function cancelDelete() {
		confirmSlug = null;
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
						<div class="flex items-center gap-2">
							<a
								href="/image/{image.slug}"
								class="text-sm text-gray-400 hover:text-white transition-colors"
							>
								View
							</a>
							{#if confirmSlug === image.slug}
								<button
									onclick={() => handleDelete(image)}
									disabled={deleting === image.slug}
									class="text-sm bg-red-600 hover:bg-red-700 text-white px-2 py-1 rounded transition-colors disabled:opacity-50"
								>
									{deleting === image.slug ? 'Deleting...' : 'Confirm'}
								</button>
								<button
									onclick={cancelDelete}
									class="text-sm text-gray-400 hover:text-white transition-colors"
								>
									Cancel
								</button>
							{:else}
								<button
									onclick={() => handleDelete(image)}
									class="text-sm text-red-400 hover:text-red-300 transition-colors"
								>
									Delete
								</button>
							{/if}
						</div>
					</div>
				{/each}
			</div>
		{/if}
	</div>
</div>
