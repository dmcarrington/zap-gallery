<script lang="ts">
	import { getAuth } from '$lib/stores/auth.svelte';
	import { getWallet } from '$lib/stores/wallet.svelte';
	import type { GalleryImage } from '$lib/nostr/events';
	import { watchZapReceipts } from '$lib/nostr/zaps';
	import { getZapEndpoint, requestZapInvoice } from '$lib/nostr/zapPurchase';
	import { saveInvoiceToken, saveZapPurchase } from '$lib/receipts';
	import QRCode from 'qrcode';
	import { onMount } from 'svelte';

	let {
		image,
		onPurchased
	}: {
		image: GalleryImage;
		/** token is null for zap purchases, which the server re-verifies from relays */
		onPurchased?: (token: string | null) => void;
	} = $props();

	const auth = getAuth();
	const wallet = getWallet();

	let zapState = $state<'idle' | 'zapping' | 'waiting' | 'paying' | 'purchased'>('idle');
	let hasPurchased = $state(false);
	let bolt11 = $state<string | null>(null);
	let token = $state<string | null>(null);
	let error = $state<string | null>(null);
	let unwatch: (() => void) | null = null;
	let pollTimer: ReturnType<typeof setInterval> | null = null;
	let qrDataUrl = $state<string | null>(null);
	let stalled = $state(false);
	let stallTimer: ReturnType<typeof setTimeout> | null = null;

	// Zap receipts usually land within seconds, but some providers are slow
	const RECEIPT_STALL_MS = 45_000;

	$effect(() => {
		if (bolt11 && zapState === 'waiting') {
			QRCode.toDataURL(bolt11.toUpperCase(), {
				width: 256,
				margin: 2,
				color: { dark: '#000000', light: '#ffffff' }
			}).then((url: string) => {
				qrDataUrl = url;
			});
		} else {
			qrDataUrl = null;
		}
	});

	onMount(() => {
		return () => {
			if (unwatch) unwatch();
			if (pollTimer) clearInterval(pollTimer);
			if (stallTimer) clearTimeout(stallTimer);
		};
	});

	async function handleZap() {
		if (!auth.pubkey || !image.eventId) return;

		error = null;
		bolt11 = null;
		token = null;
		stalled = false;
		zapState = 'zapping';

		try {
			const endpoint = await getZapEndpoint(image.publisherPubkey);
			if (endpoint) {
				await startZapPurchase(endpoint);
			} else {
				await startInvoicePurchase();
			}
		} catch (err) {
			console.error('[zap] error:', err);
			error = err instanceof Error ? err.message : 'Zap failed';
			zapState = 'idle';
		}
	}

	/** Pay the seller directly with a NIP-57 zap; the receipt is the proof of purchase. */
	async function startZapPurchase(endpoint: Parameters<typeof requestZapInvoice>[1]) {
		const invoice = await requestZapInvoice(image, endpoint);
		bolt11 = invoice;

		unwatch = watchZapReceipts(image.eventId, (receipt) => {
			if (receipt.bolt11 === invoice) {
				if (auth.pubkey) saveZapPurchase(auth.pubkey, image);
				markPurchased();
			}
		});
		stallTimer = setTimeout(() => (stalled = true), RECEIPT_STALL_MS);

		payInvoice(invoice, false);
	}

	/** Fallback for sellers without a zap-capable Lightning address: the gallery's NWC wallet. */
	async function startInvoicePurchase() {
		let invoice;
		try {
			invoice = await createServerInvoice();
		} catch (err) {
			if (err instanceof Error && err.message.includes('503')) {
				throw new Error("This seller can't receive zaps yet, so this image can't be bought.");
			}
			throw err;
		}
		bolt11 = invoice.bolt11;
		token = invoice.token;
		if (auth.pubkey) saveInvoiceToken(auth.pubkey, image, invoice.token);

		startPolling();
		payInvoice(invoice.bolt11, true);
	}

	/**
	 * Pay with the buyer's connected wallet, or show the invoice to pay manually.
	 * A preimage only proves payment for the gallery's own invoice; a zap still
	 * waits for its receipt.
	 */
	function payInvoice(pr: string, preimageCompletes: boolean) {
		if (wallet.isReady && wallet.wallet?.lnPay) {
			zapState = 'paying';
			wallet.wallet
				.lnPay({ pr })
				.then((res) => {
					if (res?.preimage && preimageCompletes) markPurchased();
				})
				.catch((err) => {
					console.warn('[zap] NWC pay error (payment may have succeeded):', err);
				});
		} else {
			zapState = 'waiting';
		}
	}

	async function createServerInvoice(): Promise<{ bolt11: string; token: string }> {
		const res = await fetch(`/api/invoice/${image.slug}`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				pubkey: auth.pubkey,
				sellerPubkey: image.publisherPubkey
			})
		});

		if (!res.ok) {
			const text = await res.text();
			throw new Error(`Failed to create invoice (${res.status}): ${text}`);
		}

		return res.json();
	}

	function markPurchased() {
		if (zapState === 'purchased') return;
		hasPurchased = true;
		zapState = 'purchased';
		onPurchased?.(token);
		if (unwatch) {
			unwatch();
			unwatch = null;
		}
		if (pollTimer) {
			clearInterval(pollTimer);
			pollTimer = null;
		}
		if (stallTimer) {
			clearTimeout(stallTimer);
			stallTimer = null;
		}
	}

	function startPolling() {
		if (pollTimer) clearInterval(pollTimer);

		pollTimer = setInterval(async () => {
			if (zapState === 'purchased' || !token) return;
			try {
				const res = await fetch(
					`/api/invoice/${image.slug}/status?token=${encodeURIComponent(token)}`
				);
				if (res.ok) {
					const data = await res.json();
					if (data.paid) markPurchased();
				}
			} catch {
				// ignore fetch errors, will retry on next interval
			}
		}, 3000);
	}

	function copyInvoice() {
		if (bolt11) navigator.clipboard.writeText(bolt11);
	}
</script>

{#snippet stalledNotice()}
	<p class="text-xs text-gray-400 text-center">
		Still waiting for the zap receipt. If your wallet shows the payment as sent,
		<button onclick={markPurchased} class="underline hover:text-white cursor-pointer">
			try the download
		</button>.
	</p>
{/snippet}

{#if zapState === 'purchased' || hasPurchased}
	<button
		onclick={() => onPurchased?.(token)}
		class="w-full bg-green-600 hover:bg-green-700 text-white font-medium py-3 px-6 rounded-lg transition-colors cursor-pointer"
	>
		Download Full Resolution
	</button>
{:else if !auth.isLoggedIn}
	<p class="text-center text-gray-400 text-sm">
		Log in with a Nostr extension to purchase
	</p>
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
		{#if stalled}
			{@render stalledNotice()}
		{/if}
	</div>
{:else if zapState === 'waiting' && bolt11}
	<div class="space-y-3">
		<p class="text-sm text-yellow-400 text-center">
			Pay this Lightning invoice to complete your purchase:
		</p>
		{#if qrDataUrl}
			<div class="flex justify-center">
				<img src={qrDataUrl} alt="Lightning invoice QR code" class="rounded-lg" width="256" height="256" />
			</div>
		{/if}
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
		{#if stalled}
			{@render stalledNotice()}
		{/if}
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
