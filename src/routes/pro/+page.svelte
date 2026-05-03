<script lang="ts">
	import { getAuth } from '$lib/stores/auth.svelte';
	import { onMount } from 'svelte';
	import { page } from '$app/stores';

	const auth = getAuth();

	let loading = $state(false);
	let error = $state<string | null>(null);
	let invoiceSvg = $state<string | null>(null);
	let paymentHash = $state<string | null>(null);
	let invoicePaid = $state(false);
	let checkingPayment = $state(false);
	let proActive = $state(false);
	let expiresAt = $state<string | null>(null);

	$effect(() => {
		if (auth.isLoggedIn) {
			checkProStatus();
		}
	});

	async function checkProStatus() {
		try {
			const res = await fetch(`/api/pro/verify?pubkey=${auth.pubkey}`);
			const data = await res.json();
			proActive = data.pro;
			expiresAt = data.expiresAt;
		} catch {
			// silently fail
		}
	}

	async function createProInvoice() {
		error = null;
		loading = true;
		invoiceSvg = null;

		try {
			const res = await fetch('/api/pro/invoice', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ pubkey: auth.pubkey })
			});

			const data = await res.json();

			if (!res.ok) {
				error = data.message || 'Failed to create invoice';
				return;
			}

			paymentHash = data.paymentHash;

			// Generate QR code from invoice
			const qrRes = await fetch(`https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(data.invoice)}`);
			const qrSvg = await qrRes.text();
			invoiceSvg = qrSvg;

			// Start polling for payment
			pollPayment(data.paymentHash);
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to create invoice';
		} finally {
			loading = false;
		}
	}

	async function pollPayment(hash: string) {
		checkingPayment = true;
		const maxAttempts = 60; // 5 minutes at 5s intervals
		let attempts = 0;

		const interval = setInterval(async () => {
			attempts++;
			try {
				const res = await fetch('/api/pro/verify', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ pubkey: auth.pubkey, paymentHash: hash })
				});

				const data = await res.json();
				if (data.pro) {
					clearInterval(interval);
					checkingPayment = false;
					invoicePaid = true;
					proActive = true;
					expiresAt = data.expiresAt;
				}
			} catch {
				// keep polling
			}

			if (attempts >= maxAttempts) {
				clearInterval(interval);
				checkingPayment = false;
				error = 'Payment timed out. Please try again.';
			}
		}, 5000);
	}
</script>

<div class="container mx-auto px-4 py-8 max-w-2xl">
	{#if !auth.isLoggedIn}
		<div class="text-center py-12">
			<h1 class="text-2xl font-bold text-white mb-4">Zap Gallery Pro</h1>
			<p class="text-gray-400">Sign in with Nostr to upgrade to Pro.</p>
		</div>
	{:else if proActive}
		<div class="text-center py-12">
			<div class="text-4xl mb-4">⚡</div>
			<h1 class="text-2xl font-bold text-white mb-2">You're a Pro!</h1>
			<p class="text-gray-400 mb-4">
				Your Pro subscription is active until {expiresAt ? new Date(expiresAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : '...'}
			</p>
			<div class="space-y-3">
				<p class="text-sm text-green-400">✓ Higher upload limits</p>
				<p class="text-sm text-green-400">✓ Priority download speeds</p>
				<p class="text-sm text-green-400">✓ Zero platform fees on sales</p>
			</div>
		</div>
	{:else if invoicePaid}
		<div class="text-center py-12">
			<div class="text-4xl mb-4">✅</div>
			<h1 class="text-2xl font-bold text-white mb-2">Payment Confirmed!</h1>
			<p class="text-gray-400">Your Pro subscription is now active for 30 days.</p>
		</div>
	{:else}
		<div class="text-center py-8">
			<h1 class="text-2xl font-bold text-white mb-2">Unlock Zap Gallery Pro</h1>
			<p class="text-gray-400 mb-8">100,000 sats (~£5) for 30 days of Pro access.</p>

			<div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8 text-left">
				<div class="bg-gray-900 border border-gray-700 rounded-lg p-6">
					<h3 class="text-white font-semibold mb-3">Free</h3>
					<ul class="space-y-2 text-sm text-gray-400">
						<li class="flex items-start gap-2">
							<span class="text-green-400">✓</span> Browse all public galleries
						</li>
						<li class="flex items-start gap-2">
							<span class="text-green-400">✓</span> Purchase full-res downloads
						</li>
						<li class="flex items-start gap-2">
							<span class="text-green-400">✓</span> Upload up to 10 images
						</li>
						<li class="flex items-start gap-2">
							<span class="text-gray-600">×</span> Priority downloads
						</li>
						<li class="flex items-start gap-2">
							<span class="text-gray-600">×</span> Zero platform fees
						</li>
					</ul>
				</div>

				<div class="bg-purple-900/30 border border-purple-700 rounded-lg p-6 relative">
					<div class="absolute -top-3 right-4 bg-purple-600 text-white text-xs font-bold px-3 py-1 rounded-full">PRO</div>
					<h3 class="text-white font-semibold mb-3">Pro — 100,000 sats</h3>
					<ul class="space-y-2 text-sm text-gray-300">
						<li class="flex items-start gap-2">
							<span class="text-purple-400">✓</span> Everything in Free
						</li>
						<li class="flex items-start gap-2">
							<span class="text-purple-400">✓</span> Priority download speeds
						</li>
						<li class="flex items-start gap-2">
							<span class="text-purple-400">✓</span> Zero platform fees (keep 100% of sales)
						</li>
						<li class="flex items-start gap-2">
							<span class="text-purple-400">✓</span> Unlimited uploads
						</li>
						<li class="flex items-start gap-2">
							<span class="text-purple-400">✓</span> Advanced search
						</li>
					</ul>
				</div>
			</div>

			{#if !invoiceSvg}
				<button
					onclick={createProInvoice}
					disabled={loading}
					class="w-full md:w-auto bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white font-medium px-8 py-3 rounded-lg transition-colors cursor-pointer"
				>
					{loading ? 'Creating invoice...' : 'Upgrade to Pro — 100,000 sats'}
				</button>
			{:else}
				<div class="space-y-4">
					<p class="text-sm text-gray-400">Scan or paste this Lightning invoice:</p>
					<div class="bg-white p-2 rounded-lg inline-block">
						{@html invoiceSvg}
					</div>
				</div>
			{/if}

			{#if checkingPayment}
				<div class="mt-4 text-sm text-gray-400 animate-pulse">
					Waiting for payment confirmation...
				</div>
			{/if}

			{#if error}
				<div class="mt-4 text-sm text-red-400">{error}</div>
			{/if}
		</div>
	{/if}
</div>
