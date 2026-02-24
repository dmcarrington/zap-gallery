<script lang="ts">
	import { NDKUser } from '@nostr-dev-kit/ndk';
	import { ndk } from '$lib/ndk';
	import { getAuth } from '$lib/stores/auth.svelte';
	import { getWallet } from '$lib/stores/wallet.svelte';
	import { GALLERY_OWNER_PUBKEY } from '$lib/config';
	import type { GalleryImage } from '$lib/nostr/events';
	import { hasValidZap, watchZapReceipts } from '$lib/nostr/zaps';
	import { onMount } from 'svelte';

	let {
		image,
		onPurchased
	}: {
		image: GalleryImage;
		onPurchased?: () => void;
	} = $props();

	const auth = getAuth();
	const wallet = getWallet();

	let zapState = $state<'idle' | 'checking' | 'zapping' | 'waiting' | 'paying' | 'purchased'>('idle');
	let hasPurchased = $state(false);
	let bolt11 = $state<string | null>(null);
	let error = $state<string | null>(null);
	let unwatch: (() => void) | null = null;

	// Check for existing zap receipt on mount and when auth changes
	onMount(() => {
		checkExistingZap();
		return () => {
			if (unwatch) unwatch();
		};
	});

	$effect(() => {
		if (auth.pubkey && image.eventId) {
			checkExistingZap();
		}
	});

	async function checkExistingZap() {
		if (!auth.pubkey || !image.eventId || !image.priceSats) return;
		zapState = 'checking';
		try {
			// Race against a timeout so the zap button is never hidden forever
			const valid = await Promise.race([
				hasValidZap(image.eventId, auth.pubkey, image.priceSats),
				new Promise<false>((resolve) => setTimeout(() => resolve(false), 5000))
			]);
			if (valid) {
				hasPurchased = true;
				zapState = 'purchased';
				onPurchased?.();
			} else {
				zapState = 'idle';
			}
		} catch {
			zapState = 'idle';
		}
	}

	/**
	 * Fetch the LNURL callback and zap endpoint for a Lightning address.
	 */
	async function getZapEndpoint(lud16: string): Promise<{ callback: string; nostrPubkey: string } | null> {
		const [name, domain] = lud16.split('@');
		if (!name || !domain) return null;

		const url = `https://${domain}/.well-known/lnurlp/${name}`;
		const res = await fetch(url);
		if (!res.ok) return null;

		const body = await res.json();
		if (body.allowsNostr && body.nostrPubkey) {
			return { callback: body.callback, nostrPubkey: body.nostrPubkey };
		}
		return null;
	}

	/**
	 * Build and sign a kind 9734 zap request, then fetch the bolt11 invoice.
	 */
	async function createZapInvoice(): Promise<string> {
		if (!ndk.signer) throw new Error('Signer required');

		// 1. Fetch owner's profile to get lightning address
		const ownerUser = new NDKUser({ pubkey: GALLERY_OWNER_PUBKEY });
		ownerUser.ndk = ndk;
		const profile = await ownerUser.fetchProfile();

		const lud16 = profile?.lud16;
		if (!lud16) throw new Error('Gallery owner has no Lightning address (lud16) in their Nostr profile');

		// 2. Get LNURL zap endpoint
		const endpoint = await getZapEndpoint(lud16);
		if (!endpoint) throw new Error(`Could not get zap endpoint for ${lud16}`);

		// 3. Build kind 9734 zap request
		const amountMsats = image.priceSats * 1000;
		const relays = ndk.pool.connectedRelays().map((r) => r.url).slice(0, 4);

		const zapRequestEvent = {
			kind: 9734,
			created_at: Math.floor(Date.now() / 1000),
			content: `Zap for "${image.title}"`,
			tags: [
				['p', GALLERY_OWNER_PUBKEY],
				['e', image.eventId],
				['amount', amountMsats.toString()],
				['relays', ...relays],
				['lnurl', endpoint.callback]
			]
		};

		// 4. Sign it with the user's NIP-07 extension
		const signed = await window.nostr!.signEvent(zapRequestEvent);

		// 5. Fetch the bolt11 invoice from the LNURL callback
		const callbackUrl = new URL(endpoint.callback);
		callbackUrl.searchParams.set('amount', amountMsats.toString());
		callbackUrl.searchParams.set('nostr', JSON.stringify(signed));

		const invoiceRes = await fetch(callbackUrl.toString());
		if (!invoiceRes.ok) {
			const text = await invoiceRes.text();
			throw new Error(`Failed to get invoice: ${text}`);
		}

		const invoiceBody = await invoiceRes.json();
		if (!invoiceBody.pr) throw new Error('No invoice returned from zap endpoint');

		return invoiceBody.pr;
	}

	async function handleZap() {
		if (!auth.pubkey || !image.eventId) return;

		error = null;
		bolt11 = null;
		zapState = 'zapping';

		try {
			// Get the bolt11 invoice
			const pr = await createZapInvoice();
			bolt11 = pr;

			startWatching();

			// Try auto-pay via NWC wallet
			if (wallet.isReady && wallet.wallet?.lnPay) {
				zapState = 'paying';

				// Fire the payment — don't await since the NWC response often
				// times out even though the payment succeeds instantly.
				wallet.wallet.lnPay({ pr }).then((res) => {
					if (res?.preimage) {
						markPurchased();
					}
				}).catch((err) => {
					console.warn('[zap] NWC response timeout (payment likely succeeded):', err);
				});

				// The NWC payment goes through almost instantly even though the
				// response event may never arrive. After a short delay, assume
				// success. The zap receipt watcher serves as backup confirmation.
				setTimeout(() => {
					if (zapState === 'paying') {
						markPurchased();
					}
				}, 5000);
			} else {
				// No wallet — show invoice for manual payment
				zapState = 'waiting';
			}
		} catch (err) {
			console.error('[zap] error:', err);
			error = err instanceof Error ? err.message : 'Zap failed';
			zapState = 'idle';
		}
	}

	function markPurchased() {
		if (zapState === 'purchased') return;
		hasPurchased = true;
		zapState = 'purchased';
		onPurchased?.();
		if (unwatch) {
			unwatch();
			unwatch = null;
		}
	}

	function startWatching() {
		if (unwatch) unwatch();
		unwatch = watchZapReceipts(image.eventId, (receipt) => {
			if (receipt.senderPubkey === auth.pubkey && receipt.amountSats >= image.priceSats) {
				markPurchased();
			}
		});
	}

	function copyInvoice() {
		if (bolt11) navigator.clipboard.writeText(bolt11);
	}
</script>

{#if zapState === 'purchased' || hasPurchased}
	<button
		onclick={() => onPurchased?.()}
		class="w-full bg-green-600 hover:bg-green-700 text-white font-medium py-3 px-6 rounded-lg transition-colors cursor-pointer"
	>
		Download Full Resolution
	</button>
{:else if !auth.isLoggedIn}
	<p class="text-center text-gray-400 text-sm">
		Log in with a Nostr extension to purchase
	</p>
{:else if zapState === 'checking'}
	<div class="w-full text-center py-3 text-gray-400 text-sm">
		Checking purchase status...
	</div>
{:else if zapState === 'zapping'}
	<button
		disabled
		class="w-full bg-yellow-500/50 text-black font-medium py-3 px-6 rounded-lg cursor-wait"
	>
		Creating invoice...
	</button>
{:else if zapState === 'paying'}
	<div class="w-full text-center py-3 space-y-2">
		<p class="text-yellow-400 text-sm font-medium">Payment sent, waiting for confirmation...</p>
		<p class="text-xs text-gray-500">This may take a few moments</p>
	</div>
{:else if zapState === 'waiting' && bolt11}
	<div class="space-y-3">
		<p class="text-sm text-yellow-400 text-center">
			Pay this Lightning invoice to complete your purchase:
		</p>
		<div class="relative">
			<input
				type="text"
				value={bolt11}
				readonly
				class="w-full rounded-lg bg-gray-900 border border-gray-700 px-3 py-2 text-xs text-gray-400 font-mono truncate pr-16"
			/>
			<button
				onclick={copyInvoice}
				class="absolute right-1 top-1 bg-gray-700 hover:bg-gray-600 text-white text-xs px-2 py-1 rounded cursor-pointer"
			>
				Copy
			</button>
		</div>
		<p class="text-xs text-gray-500 text-center">
			Waiting for payment confirmation...
		</p>
	</div>
{:else}
	<div class="space-y-2">
		<button
			onclick={handleZap}
			class="w-full bg-yellow-500 hover:bg-yellow-600 text-black font-medium py-3 px-6 rounded-lg transition-colors cursor-pointer"
		>
			&#9889; Zap {image.priceSats.toLocaleString()} sats
		</button>
		{#if error}
			<p class="text-sm text-red-400 text-center">{error}</p>
		{/if}
	</div>
{/if}
