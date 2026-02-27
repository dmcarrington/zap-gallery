<script lang="ts">
	import { getAuth } from '$lib/stores/auth.svelte';
	import { getWallet } from '$lib/stores/wallet.svelte';
	import type { GalleryImage } from '$lib/nostr/events';
	import { watchZapReceipts } from '$lib/nostr/zaps';
	import QRCode from 'qrcode';
	import { onMount } from 'svelte';

	let {
		image,
		onPurchased
	}: {
		image: GalleryImage;
		onPurchased?: (paymentHash: string) => void;
	} = $props();

	const auth = getAuth();
	const wallet = getWallet();

	let zapState = $state<'idle' | 'zapping' | 'waiting' | 'paying' | 'purchased'>('idle');
	let hasPurchased = $state(false);
	let bolt11 = $state<string | null>(null);
	let paymentHash = $state<string | null>(null);
	let error = $state<string | null>(null);
	let unwatch: (() => void) | null = null;
	let pollTimer: ReturnType<typeof setInterval> | null = null;
	let qrDataUrl = $state<string | null>(null);

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
		};
	});

	async function createServerInvoice(): Promise<{ bolt11: string; paymentHash: string }> {
		const res = await fetch(`/api/invoice/${image.slug}`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				pubkey: auth.pubkey,
				priceSats: image.priceSats
			})
		});

		if (!res.ok) {
			const text = await res.text();
			throw new Error(`Failed to create invoice: ${text}`);
		}

		return res.json();
	}

	async function handleZap() {
		if (!auth.pubkey || !image.eventId) return;

		error = null;
		bolt11 = null;
		paymentHash = null;
		zapState = 'zapping';

		try {
			const invoice = await createServerInvoice();
			bolt11 = invoice.bolt11;
			paymentHash = invoice.paymentHash;

			startPolling();

			// Also watch for zap receipts as supplementary signal
			if (image.eventId) {
				unwatch = watchZapReceipts(image.eventId, (receipt) => {
					if (receipt.senderPubkey === auth.pubkey && receipt.amountSats >= image.priceSats) {
						markPurchased();
					}
				});
			}

			// Try auto-pay via NWC wallet
			if (wallet.isReady && wallet.wallet?.lnPay) {
				zapState = 'paying';

				wallet.wallet.lnPay({ pr: invoice.bolt11 }).then((res) => {
					if (res?.preimage) {
						markPurchased();
					}
				}).catch((err) => {
					console.warn('[zap] NWC pay error (payment may have succeeded):', err);
				});
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
		if (paymentHash) onPurchased?.(paymentHash);
		if (unwatch) {
			unwatch();
			unwatch = null;
		}
		if (pollTimer) {
			clearInterval(pollTimer);
			pollTimer = null;
		}
	}

	function startPolling() {
		if (pollTimer) clearInterval(pollTimer);

		pollTimer = setInterval(async () => {
			if (zapState === 'purchased' || !paymentHash) return;
			try {
				const res = await fetch(
					`/api/invoice/${image.slug}/status?payment_hash=${encodeURIComponent(paymentHash)}`
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

{#if zapState === 'purchased' || hasPurchased}
	<button
		onclick={() => { if (paymentHash) onPurchased?.(paymentHash); }}
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
