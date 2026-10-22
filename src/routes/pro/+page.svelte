<script lang="ts">
	import { onDestroy } from 'svelte';
	import QRCode from 'qrcode';
	import { getAuth, refreshPro } from '$lib/stores/auth.svelte';
	import { PRO_PRICE_SATS, PRO_DURATION_DAYS } from '$lib/config';

	const auth = getAuth();

	type Stage = 'idle' | 'creating' | 'awaiting' | 'verifying' | 'success' | 'error';

	let stage = $state<Stage>('idle');
	let bolt11 = $state<string | null>(null);
	let qrDataUrl = $state<string | null>(null);
	let paymentHash = $state<string | null>(null);
	let amountSats = $state<number>(PRO_PRICE_SATS);
	let invoiceExpiresAt = $state<number | null>(null);
	let error = $state<string | null>(null);
	let pollTimer: ReturnType<typeof setInterval> | null = null;

	function formatExpiry(secs: number): string {
		return new Date(secs * 1000).toLocaleDateString('en-GB', {
			year: 'numeric',
			month: 'short',
			day: 'numeric'
		});
	}

	async function startUpgrade() {
		if (!auth.pubkey) {
			error = 'Please log in first.';
			stage = 'error';
			return;
		}

		stage = 'creating';
		error = null;
		try {
			const res = await fetch('/api/pro/invoice', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ pubkey: auth.pubkey })
			});
			if (!res.ok) {
				const msg = await res.text();
				throw new Error(msg || 'Failed to create invoice');
			}
			const data = await res.json();
			bolt11 = data.bolt11;
			paymentHash = data.paymentHash;
			amountSats = data.amountSats;
			invoiceExpiresAt = data.expiresAt;

			qrDataUrl = await QRCode.toDataURL(`lightning:${bolt11}`, { margin: 1, scale: 6 });

			stage = 'awaiting';
			startPolling();
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to create invoice';
			stage = 'error';
		}
	}

	function startPolling() {
		stopPolling();
		pollTimer = setInterval(verifyPayment, 4000);
	}

	function stopPolling() {
		if (pollTimer) {
			clearInterval(pollTimer);
			pollTimer = null;
		}
	}

	async function verifyPayment() {
		if (!auth.pubkey || !paymentHash) return;
		if (invoiceExpiresAt && Math.floor(Date.now() / 1000) > invoiceExpiresAt) {
			stopPolling();
			error = 'Invoice expired. Please start again.';
			stage = 'error';
			return;
		}

		try {
			const res = await fetch('/api/pro/verify', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ pubkey: auth.pubkey, paymentHash })
			});
			if (res.status === 402) {
				return; // not paid yet, keep polling
			}
			if (!res.ok) {
				const msg = await res.text();
				throw new Error(msg || 'Verification failed');
			}
			const data = await res.json();
			if (data.pro) {
				stopPolling();
				stage = 'success';
				await refreshPro();
			}
		} catch (err) {
			stopPolling();
			error = err instanceof Error ? err.message : 'Verification failed';
			stage = 'error';
		}
	}

	async function copy(text: string) {
		try {
			await navigator.clipboard.writeText(text);
		} catch {
			// ignore
		}
	}

	onDestroy(stopPolling);
</script>

<div class="container mx-auto px-4 py-8 max-w-2xl">
	<h1 class="text-2xl font-bold text-white mb-2">Pro Tier</h1>
	<p class="text-gray-400 text-sm mb-6">
		Pay {PRO_PRICE_SATS.toLocaleString()} sats and your images appear in the gallery for the next {PRO_DURATION_DAYS}
		days. Free accounts can upload one image as a preview.
	</p>

	{#if !auth.isLoggedIn}
		<div class="bg-gray-900 border border-gray-800 rounded-lg p-6 text-center">
			<p class="text-gray-400">Log in with Nostr above to upgrade.</p>
		</div>
	{:else if auth.isPro}
		<div class="bg-green-900/30 border border-green-700 rounded-lg p-6">
			<h2 class="text-lg font-semibold text-green-300 mb-1">You're Pro ⚡</h2>
			{#if auth.proExpiresAt}
				<p class="text-sm text-green-200/80">Active until {formatExpiry(auth.proExpiresAt)}.</p>
			{/if}
			<a href="/admin" class="mt-4 inline-block text-purple-400 hover:underline text-sm">
				Go to your dashboard →
			</a>
			{#if stage !== 'success'}
				<div class="mt-6 pt-6 border-t border-green-800/50">
					<p class="text-sm text-gray-400 mb-2">Renew or extend:</p>
					<button
						onclick={startUpgrade}
						class="bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors cursor-pointer"
					>
						Pay {PRO_PRICE_SATS.toLocaleString()} sats for another {PRO_DURATION_DAYS} days
					</button>
				</div>
			{/if}
		</div>
	{:else if stage === 'idle' || stage === 'error'}
		<div class="bg-gray-900 border border-gray-800 rounded-lg p-6">
			<button
				onclick={startUpgrade}
				class="w-full bg-purple-600 hover:bg-purple-700 text-white font-medium py-3 px-4 rounded-lg transition-colors cursor-pointer"
			>
				Upgrade for {PRO_PRICE_SATS.toLocaleString()} sats
			</button>
			{#if error}
				<p class="mt-3 text-sm text-red-400">{error}</p>
			{/if}
			<p class="mt-3 text-xs text-gray-500">
				By upgrading you accept the
				<a href="/terms" class="underline hover:text-gray-300">Terms of Service</a>.
			</p>
		</div>
	{:else if stage === 'creating'}
		<div class="bg-gray-900 border border-gray-800 rounded-lg p-6 text-center">
			<p class="text-gray-400">Creating invoice…</p>
		</div>
	{:else if stage === 'awaiting' && bolt11}
		<div class="bg-gray-900 border border-gray-800 rounded-lg p-6 space-y-4">
			<div class="text-center">
				<p class="text-sm text-gray-400 mb-3">Pay {amountSats.toLocaleString()} sats with any Lightning wallet:</p>
				{#if qrDataUrl}
					<img src={qrDataUrl} alt="Lightning invoice QR" class="mx-auto bg-white p-2 rounded-lg max-w-xs" />
				{/if}
			</div>
			<div>
				<label for="bolt11-text" class="block text-xs text-gray-500 mb-1">Or copy the invoice:</label>
				<div class="flex gap-2">
					<input
						id="bolt11-text"
						type="text"
						readonly
						value={bolt11}
						class="flex-1 bg-gray-800 border border-gray-700 rounded px-2 py-1 text-white text-xs font-mono"
					/>
					<button
						onclick={() => copy(bolt11!)}
						class="bg-gray-700 hover:bg-gray-600 text-white text-xs px-3 py-1 rounded cursor-pointer"
					>
						Copy
					</button>
				</div>
			</div>
			<p class="text-xs text-gray-500 text-center">
				Waiting for payment… (the page will update automatically)
			</p>
		</div>
	{:else if stage === 'verifying'}
		<div class="bg-gray-900 border border-gray-800 rounded-lg p-6 text-center">
			<p class="text-gray-400">Verifying payment…</p>
		</div>
	{:else if stage === 'success'}
		<div class="bg-green-900/30 border border-green-700 rounded-lg p-6 text-center">
			<h2 class="text-lg font-semibold text-green-300 mb-2">Payment confirmed ⚡</h2>
			<p class="text-sm text-green-200/80 mb-4">
				You're a Pro seller for the next {PRO_DURATION_DAYS} days.
			</p>
			<a
				href="/admin"
				class="inline-block bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium px-4 py-2 rounded-lg cursor-pointer"
			>
				Go to your dashboard
			</a>
		</div>
	{/if}
</div>
