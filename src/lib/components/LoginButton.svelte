<script lang="ts">
	import { getAuth, login, logout } from '$lib/stores/auth.svelte';
	import { nip19 } from 'nostr-tools';

	const auth = getAuth();

	let error = $state<string | null>(null);
	let loggingIn = $state(false);
	let showNsecInput = $state(false);
	let nsecInput = $state('');

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

	async function handleNsecLogin() {
		error = null;
		if (!nsecInput.trim()) {
			error = 'Please paste your nsec';
			return;
		}
		loggingIn = true;
		try {
			await login(nsecInput.trim());
			nsecInput = '';
			showNsecInput = false;
		} catch (err) {
			error = err instanceof Error ? err.message : 'Login failed';
		} finally {
			loggingIn = false;
		}
	}

	function handleNsecKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter') handleNsecLogin();
	}

	function toggleNsec() {
		showNsecInput = !showNsecInput;
		error = null;
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
	<div class="flex flex-col gap-2">
		<div class="flex items-center gap-2">
			<button
				onclick={handleLogin}
				disabled={loggingIn}
				class="bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors cursor-pointer"
			>
				{loggingIn && !showNsecInput ? 'Connecting...' : 'Login with Nostr'}
			</button>
			<button
				onclick={toggleNsec}
				class="text-sm text-gray-400 hover:text-white transition-colors cursor-pointer"
			>
				{showNsecInput ? 'Use extension' : 'Use nsec'}
			</button>
		</div>

		{#if showNsecInput}
			<div class="flex items-center gap-2">
				<input
					type="password"
					bind:value={nsecInput}
					onkeydown={handleNsecKeydown}
					placeholder="nsec1..."
					class="flex-1 bg-gray-800 border border-gray-600 text-white text-sm rounded px-3 py-2 font-mono focus:outline-none focus:border-purple-500"
				/>
				<button
					onclick={handleNsecLogin}
					disabled={loggingIn}
					class="bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors cursor-pointer whitespace-nowrap"
				>
					{loggingIn ? 'Logging in...' : 'Login'}
				</button>
			</div>
		{/if}

		{#if error}
			<span class="text-sm text-red-400">{error}</span>
		{/if}
	</div>
{/if}