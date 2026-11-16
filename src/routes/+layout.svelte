<script lang="ts">
	import '../app.css';
	import Header from '$lib/components/Header.svelte';
	import Footer from '$lib/components/Footer.svelte';
	import { APP_NAME } from '$lib/config';

	let { children } = $props();
</script>

<svelte:head>
	<title>{APP_NAME}</title>
	<meta
		name="description"
		content={`${APP_NAME} — personal photo galleries on Nostr, paid in Lightning`}
	/>
</svelte:head>

<div class="min-h-screen bg-gray-950 text-white flex flex-col">
	<Header />
	<main class="flex-1 mx-auto max-w-6xl px-4 py-6 w-full">
		{@render children()}
	</main>
	<Footer />
</div>
