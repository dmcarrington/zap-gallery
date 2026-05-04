<script lang="ts">
	import '../app.css';
	import Header from '$lib/components/Header.svelte';
	import Footer from '$lib/components/Footer.svelte';
	import { subscribeToGallery, unsubscribeFromGallery } from '$lib/stores/gallery.svelte';
	import { onMount } from 'svelte';

	let { children } = $props();

	onMount(() => {
		subscribeToGallery();
		return () => unsubscribeFromGallery();
	});
</script>

<svelte:head>
	<title>Zap Gallery</title>
	<meta name="description" content="Photo gallery powered by Nostr and Lightning" />
</svelte:head>

<div class="min-h-screen bg-gray-950 text-white flex flex-col">
	<Header />
	<main class="flex-1 mx-auto max-w-6xl px-4 py-6 w-full">
		{@render children()}
	</main>
	<Footer />
</div>
