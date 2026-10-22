<script lang="ts">
	import type { GalleryImage } from '$lib/nostr/events';

	let { image, isPro }: { image: GalleryImage; isPro?: boolean } = $props();
</script>

<a
	href="/image/{image.publisherPubkey}/{image.slug}"
	class="group relative block overflow-hidden rounded-lg bg-gray-900 aspect-square"
	data-pro={isPro ? 'true' : undefined}
>
	{#if image.thumbnailUrl}
		<img
			src={image.thumbnailUrl}
			alt={image.title}
			loading="lazy"
			class="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
		/>
	{/if}
	<div
		class="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity"
	>
		<div class="absolute bottom-0 left-0 right-0 p-3">
			<h3 class="text-sm font-medium text-white truncate">{image.title}</h3>
			{#if image.priceSats > 0}
				<span class="text-xs text-yellow-400 font-medium">
					&#9889; {image.priceSats.toLocaleString()} sats
				</span>
			{/if}
			{#if isPro}
				<span class="text-xs text-amber-400 font-bold mt-1 block">Pro Tier</span>
			{/if}
		</div>
	</div>
</a>
