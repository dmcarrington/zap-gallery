<script lang="ts">
	import { getAuth, login, logout } from '$lib/stores/auth.svelte';
	import { nip19 } from 'nostr-tools';

	const auth = getAuth();

	let error = $state<string | null>(null);
	let loggingIn = $state(false);
	let showNsec = $state(false);
	let nsecInput = $state('');

	function truncatedNpub(pubkey: string): string {
		const npub = nip19.npubEncode(pubkey);
		return `${npub.slice(0, 8)}...${npub.slice(-4)}`;
	}

	async function handleNip07Login() {
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

	async function handleNsecLogin() {
		error = null;
		loggingIn = true;
		try {
			await login(nsecInput.trim());
			nsecInput = '';
			showNsec = false;
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
	<div class="flex flex-col gap-2 items-end">
		<div class="flex items-center gap-2">
			<button
				onclick={handleNip07Login}
				disabled={loggingIn}
				class="bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors cursor-pointer"
			>
				{loggingIn ? 'Connecting...' : 'Login with Nostr'}
			</button>
			<button
				onclick={() => (showNsec = !showNsec)}
				class="text-sm text-gray-400 hover:text-white transition-colors cursor-pointer"
			>
				{showNsec ? 'Cancel' : 'Use nsec'}
			</button>
		</div>
		{#if showNsec}
			<form onsubmit={(e) => { e.preventDefault(); handleNsecLogin(); }} class="flex items-center gap-2">
				<input
					type="password"
					bind:value={nsecInput}
					placeholder="nsec1..."
					class="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-white text-xs font-mono w-64 focus:border-purple-500 outline-none"
				/>
				<button
					type="submit"
					disabled={loggingIn || !nsecInput.trim()}
					class="bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white text-xs font-medium px-3 py-1 rounded transition-colors cursor-pointer"
				>
					{loggingIn ? '…' : 'Sign in'}
				</button>
			</form>
		{/if}
		{#if error}
			<span class="text-sm text-red-400">{error}</span>
		{/if}
	</div>
{/if}
