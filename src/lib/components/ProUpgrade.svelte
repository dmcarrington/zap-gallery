<script lang="ts">
	import { getAuth } from '$lib/stores/auth.svelte';

	const auth = getAuth();
	let { feature = 'this feature' }: { feature?: string } = $props();
</script>

<div class="bg-gray-900 border border-gray-700 rounded-lg p-6 text-center">
	<div class="text-2xl mb-2">⚡</div>
	<h3 class="text-white font-semibold mb-2">Pro Feature</h3>
	<p class="text-gray-400 text-sm mb-4">
		{feature} is available to Pro subscribers.
	</p>
	<a
		href="/pro"
		class="inline-block bg-purple-600 hover:bg-purple-700 text-white font-medium px-6 py-2 rounded-lg transition-colors text-sm"
	>
		Upgrade to Pro — 100,000 sats
	</a>
	<p class="text-gray-500 text-xs mt-3">
		Or <a href="/" class="underline hover:text-gray-300">browse free features</a>
	</p>
</div>
