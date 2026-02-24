<script lang="ts">
	import { getWallet, connectWallet, disconnectWallet } from '$lib/stores/wallet.svelte';

	const wallet = getWallet();

	let pairingInput = $state('');
	let connecting = $state(false);
	let connectError = $state<string | null>(null);
	let showInput = $state(false);

	async function handleConnect() {
		if (!pairingInput.trim()) return;
		connecting = true;
		connectError = null;
		try {
			await connectWallet(pairingInput.trim());
			pairingInput = '';
			showInput = false;
		} catch (err) {
			connectError = err instanceof Error ? err.message : 'Connection failed';
		} finally {
			connecting = false;
		}
	}
</script>

{#if wallet.isReady}
	<div class="flex items-center gap-3 rounded-lg bg-gray-800 px-3 py-2 text-sm">
		<span class="text-green-400">Wallet connected</span>
		{#if wallet.balanceSats !== null}
			<span class="text-gray-400">
				{wallet.balanceSats.toLocaleString()} sats
			</span>
		{/if}
		<button
			onclick={disconnectWallet}
			class="text-gray-500 hover:text-white transition-colors cursor-pointer"
		>
			Disconnect
		</button>
	</div>
{:else if showInput}
	<div class="space-y-2">
		<div class="flex gap-2">
			<input
				type="text"
				bind:value={pairingInput}
				placeholder="nostr+walletconnect://..."
				disabled={connecting}
				class="flex-1 rounded-lg bg-gray-900 border border-gray-700 px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-purple-500 focus:outline-none"
			/>
			<button
				onclick={handleConnect}
				disabled={connecting || !pairingInput.trim()}
				class="bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors cursor-pointer"
			>
				{connecting ? '...' : 'Connect'}
			</button>
		</div>
		{#if connectError}
			<p class="text-sm text-red-400">{connectError}</p>
		{/if}
		<button
			onclick={() => { showInput = false; }}
			class="text-xs text-gray-500 hover:text-gray-300 cursor-pointer"
		>
			Cancel
		</button>
	</div>
{:else}
	<button
		onclick={() => { showInput = true; }}
		class="text-sm text-purple-400 hover:text-purple-300 transition-colors cursor-pointer"
	>
		Connect wallet (NWC)
	</button>
{/if}
