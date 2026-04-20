<script lang="ts">
	import { getGallery } from '$lib/stores/gallery.svelte';

	const gallery = getGallery();
</script>

<div class="min-h-screen bg-gray-900 text-white">
	<div class="container mx-auto px-4 py-8">
		<header class="mb-8">
			<h1 class="text-3xl font-bold">Gallery Owner Dashboard</h1>
			<p class="text-gray-400 mt-2">
				Upload images, manage listings, and view analytics.
			</p>
			<a href="/+page.svelte" class="mt-3 inline-block bg-gray-700 text-white px-4 py-2 rounded hover:bg-gray-600">
				Back to Gallery
			</a>
		</header>

		{#if gallery.loading}
			<p class="text-gray-500 italic">Loading gallery...</p>
		{:else}
			<div class="bg-gray-800 rounded-lg p-4">
				<h2 class="text-xl font-bold mb-4">Gallery Stats</h2>
				<ul class="space-y-2 text-sm">
					<li class="flex justify-between">
						<span>Total Images:</span>
						<span class="font-bold">{gallery.images.length}</span>
					</li>
				</ul>
			</div>

			<div class="mt-8">
				<h2 class="text-xl font-bold mb-4">Images</h2>
				{#each gallery.images as image}
					<div class="bg-gray-800 p-4 rounded mb-4">
						<div class="flex items-center gap-4">
							<img src={image.thumbnailUrl} alt={image.title} class="w-24 h-24 object-cover rounded" />
							<div>
								<h3 class="font-medium">{image.title}</h3>
								<p class="text-sm text-gray-400">#{image.slug} | {image.priceSats} sats</p>
							</div>
						</div>
					</div>
				{/each}
			</div>
		{/if}
	</div>
</div>
