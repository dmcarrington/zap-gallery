<script lang="ts">
	import { browser } from '$app/environment';
	import { NDKPrivateKeySigner } from '@nostr-dev-kit/ndk';
	import { getPublicKey } from 'nostr-tools';

	// Props
	let { pubkey, priceSats }: { pubkey: string; priceSats: number } = $props();

	// State
	let signingIn = $state(false);
	let proVerified = $state(false);
	let error = $state<string | null>(null);

	// Nostr signer (NIP-07 if available, or private key fallback)
	let signer: any = null;

	// Check if NIP-07 extension is available
	if (browser && window.nostr) {
		signer = {
			signEvent: (draft: any) => window.nostr.signEvent(draft),
			getPublicKey: () => window.nostr.getPublicKey()
		};
	}

	// NWC invoice generation
	async function createProInvoice() {
		try {
			const response = await fetch('/api/pro/invoice', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ pubkey, tier: 'pro' })
			});

			if (!response.ok) {
				throw new Error('Failed to create invoice');
			}

			const data = await response.json();
			return data;
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to create invoice';
			return null;
		}
	}

	// NWC wallet payment flow
	async function payWithNwc(invoice: string) {
		if (!window.nostr?.nwc) {
			error = 'NWC wallet not available. Please use an extension like Alby.';
			return false;
		}

		try {
			const response = await window.nostr.nwc(invoice);
			return response;
		} catch (err) {
			error = 'Payment failed. Please try again.';
			return false;
		}
	}

	// Verify Pro status after payment
	async function verifyProStatus() {
		const challenge = `zap-gallery-pro: authenticate ${pubkey}`;
		if (!signer || !signer.signEvent) {
			error = 'NIP-07 extension not available';
			return;
		}

		signingIn = true;
		try {
			const draft = {
				kind: 27235,
				content: '',
				tags: [
					['challenge', challenge],
					['relays', ...PUBLIC_RELAY_URLS.split(',').map(r => r.trim())]
				],
				created_at: Math.floor(Date.now() / 1000)
			};

			const signedEvent = await signer.signEvent(draft);

			const response = await fetch('/api/auth/pro', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					pubkey: signer.getPublicKey(),
					sig: signedEvent.sig,
					challenge: challenge
				})
			});

			if (response.ok) {
				proVerified = true;
			}
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to verify Pro status';
		} finally {
			signingIn = false;
		}
	}

	// Upgrade flow
	async function upgradeToPro() {
		error = null;
		const invoiceData = await createProInvoice();
		if (!invoiceData || !invoiceData.bolt11) {
			return;
		}

		// Open NWC wallet for payment
		const paymentResult = await payWithNwc(invoiceData.bolt11);
		if (paymentResult) {
			// Payment succeeded, verify Pro status
			await verifyProStatus();
		}
	}

	// Check if user is already Pro (from NWC wallet zaps)
	$effect(() => {
		// Could checkzap receipts on relays for this pubkey
		// For now, just use proVerified state
	});
</script>

<div class="bg-gray-800/50 border border-amber-500/30 rounded-lg p-6 mb-6">
	<h3 class="text-xl font-bold text-amber-400 mb-2">Upgrade to Pro Tier</h3>
	<p class="text-sm text-gray-400 mb-4">
		Get analytics, priority support, and featured placement. Costs £5/mo (≈{priceSats.toLocaleString()} sats).
	</p>

	{#if proVerified}
		<div class="bg-green-500/20 border border-green-500/50 text-green-400 px-4 py-3 rounded mb-4">
			<strong>You're a Pro user!</strong>
		</div>
	{:else}
		{#if error}
			<div class="bg-red-500/20 border border-red-500/50 text-red-400 px-4 py-3 rounded mb-4">
				{error}
			</div>
		{/if}

		<button
			on:click|preventDefault={upgradeToPro}
			disabled={signingIn}
			class="w-full bg-amber-500 hover:bg-amber-400 text-black font-medium py-2 px-4 rounded transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
		>
			{#if signingIn}
				<span>Verifying...</span>
			{:else}
				<span>Upgrade for {priceSats.toLocaleString()} sats</span>
			{/if}
		</button>
		<p class="text-xs text-center text-gray-500 mt-3">
			By upgrading, you accept the <a href="/terms" class="underline hover:text-gray-300">Terms of Service</a>
		</p>
	{/if}
</div>
