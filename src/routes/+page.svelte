<script lang="ts">
	import ImageGrid from '$lib/components/ImageGrid.svelte';
	import { getGallery } from '$lib/stores/gallery.svelte';

	const gallery = getGallery();
</script>

<div class="container mx-auto px-4 py-8">
	<h1 class="text-2xl font-bold text-white mb-2">⚡ Zap Gallery</h1>
	<p class="text-gray-400 text-sm mb-6">
		High-res photography. Pay with Lightning, download instantly.
	</p>
	<ImageGrid images={gallery.images} loading={gallery.loading && !gallery.loaded} />
</div>
