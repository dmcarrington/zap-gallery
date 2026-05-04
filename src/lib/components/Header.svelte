<script lang="ts">
	import LoginButton from './LoginButton.svelte';
	import { getAuth } from '$lib/stores/auth.svelte';

	const auth = getAuth();
</script>

<header class="border-b border-gray-800 bg-gray-950">
	<nav class="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
		<div class="flex items-center gap-6">
			<a href="/" class="text-xl font-bold text-white hover:text-purple-400 transition-colors">
				Zap Gallery
			</a>
			{#if auth.isLoggedIn}
				<a
					href="/admin"
					class="text-sm text-gray-400 hover:text-white transition-colors"
				>
					Admin
				</a>
				<a
					href="/pro"
					class="text-sm {auth.isPro ? 'text-purple-400 font-medium' : 'text-gray-400'} hover:text-white transition-colors"
				>
					{auth.isPro ? 'Pro ⚡' : 'Upgrade'}
				</a>
			{/if}
		</div>
		<LoginButton />
	</nav>
</header>
