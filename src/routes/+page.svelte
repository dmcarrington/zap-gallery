<script lang="ts">
	import { onMount } from 'svelte';
	import ImageGrid from '$lib/components/ImageGrid.svelte';
	import { getGallery } from '$lib/stores/gallery.svelte';
	import { GALLERY_OWNER_PUBKEY } from '$lib/config';

	onMount(() => {
		getGallery(GALLERY_OWNER_PUBKEY).subscribe(() => {});
	});
</script>

<div class="container mx-auto px-4 py-8">
	<h1 class="text-2xl font-bold text-white mb-2">⚡ Zap Gallery</h1>
	<p class="text-gray-400 text-sm mb-6">
		Browse images. Zap to download full-resolution versions.
	</p>
	<ImageGrid pubkey={GALLERY_OWNER_PUBKEY} />
</div>
