<script lang="ts">
	import { getAuth, login, logout } from '$lib/stores/auth.svelte';
	import { nip19 } from 'nostr-tools';

	const auth = getAuth();

	let error = $state<string | null>(null);
	let loggingIn = $state(false);

	function truncatedNpub(pubkey: string): string {
		const npub = nip19.npubEncode(pubkey);
		return `${npub.slice(0, 8)}...${npub.slice(-4)}`;
	}

	async function handleLogin() {
		error = null;
		loggingIn = true;
		try {
			await login();
		} catch (err) {
			error = err instanceof Error ? err.message : 'Login failed';
		} finally {
			loggingIn = false;
		}
	}
</script>

{#if auth.isLoggedIn && auth.pubkey}
	<div class="flex items-center gap-2">
		<span class="text-sm text-gray-300 font-mono">{truncatedNpub(auth.pubkey)}</span>
		<button
			onclick={logout}
			class="text-sm text-gray-400 hover:text-white transition-colors cursor-pointer"
		>
			Logout
		</button>
	</div>
{:else}
	<div class="flex items-center gap-2">
		<button
			onclick={handleLogin}
			disabled={loggingIn}
			class="bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors cursor-pointer"
		>
			{loggingIn ? 'Connecting...' : 'Login with Nostr'}
		</button>
		{#if error}
			<span class="text-sm text-red-400">{error}</span>
		{/if}
	</div>
{/if}
