<script lang="ts">
	import { nip19 } from 'nostr-tools';
	import { getAuth } from '$lib/stores/auth.svelte';
	import { FREE_UPLOAD_LIMIT, PRO_PRICE_SATS, PRO_DURATION_DAYS } from '$lib/config';

	const auth = getAuth();

	const myNpub = $derived(auth.pubkey ? safeNpub(auth.pubkey) : null);

	function safeNpub(pubkey: string): string | null {
		try {
			return nip19.npubEncode(pubkey);
		} catch {
			return null;
		}
	}
</script>

<div class="container mx-auto px-4 py-12 max-w-2xl text-center">
	<h1 class="text-3xl font-bold text-white mb-3">⚡ Zap Gallery</h1>
	<p class="text-gray-400 mb-10">
		Personal photo galleries on Nostr. Each user has a gallery at
		<code class="text-purple-300">/{`<npub>`}</code>; visitors pay sats to download
		full-resolution images.
	</p>

	{#if auth.isLoggedIn && myNpub}
		<div class="bg-gray-900 border border-gray-800 rounded-lg p-6 text-left">
			<p class="text-sm text-gray-400 mb-2">Your gallery is at:</p>
			<a
				href="/{myNpub}"
				class="block text-purple-400 hover:text-purple-300 font-mono text-sm break-all mb-4"
			>
				/{myNpub}
			</a>
			<div class="flex flex-wrap gap-2">
				<a
					href="/{myNpub}"
					class="bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
				>
					View
				</a>
				<a
					href="/admin"
					class="bg-gray-700 hover:bg-gray-600 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
				>
					Upload / manage
				</a>
				{#if !auth.isPro}
					<a
						href="/pro"
						class="bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-200 text-sm font-medium px-4 py-2 rounded-lg transition-colors"
					>
						Upgrade to Pro
					</a>
				{/if}
			</div>
			{#if !auth.isPro}
				<p class="text-xs text-gray-500 mt-4">
					Free tier is capped at {FREE_UPLOAD_LIMIT} listing{FREE_UPLOAD_LIMIT === 1 ? '' : 's'}. Pro is
					{PRO_PRICE_SATS.toLocaleString()} sats for {PRO_DURATION_DAYS} days, no upload limit.
				</p>
			{/if}
		</div>
	{:else}
		<div class="bg-gray-900 border border-gray-800 rounded-lg p-6">
			<p class="text-gray-400 mb-4">Log in with Nostr (top-right) to start a gallery.</p>
			<p class="text-xs text-gray-500">
				Free tier lets you publish {FREE_UPLOAD_LIMIT} image{FREE_UPLOAD_LIMIT === 1 ? '' : 's'}; Pro
				({PRO_PRICE_SATS.toLocaleString()} sats / {PRO_DURATION_DAYS} days) is unlimited.
			</p>
		</div>
		<p class="text-xs text-gray-500 mt-6">
			Already know an npub? Visit <code class="text-purple-300">/&lt;npub&gt;</code> directly.
		</p>
	{/if}
</div>
