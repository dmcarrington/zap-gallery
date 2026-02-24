<script lang="ts">
	import ImageGrid from '$lib/components/ImageGrid.svelte';
	import { getGallery } from '$lib/stores/gallery.svelte';

	const gallery = getGallery();
</script>

<ImageGrid images={gallery.images} loading={gallery.loading} />
