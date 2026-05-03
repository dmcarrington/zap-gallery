<script lang="ts">
	import Footer from '$lib/components/Footer.svelte';
</script>

<div class="container mx-auto px-4 py-8 max-w-2xl">
	<h1 class="text-2xl font-bold text-white mb-6">Privacy Policy</h1>

	<div class="prose prose-invert prose-sm max-w-none text-gray-300 space-y-4">
		<p><strong>Last updated:</strong> May 2026</p>

		<h2 class="text-lg font-semibold text-white mt-6">What We Don't Collect</h2>
		<ul class="list-disc pl-5 space-y-1">
			<li>No email addresses</li>
			<li>No passwords</li>
			<li>No personal information</li>
			<li>No cookies (other than what SvelteKit requires for sessions)</li>
			<li>No analytics</li>
			<li>No tracking of any kind</li>
		</ul>

		<h2 class="text-lg font-semibold text-white mt-6">What You Share</h2>
		<p>When you sign in with a NIP-07 browser extension, only your Nostr public key is stored locally in your browser for session persistence. This never leaves your device. The server sees your public key only for the duration of API requests that require authentication.</p>

		<h2 class="text-lg font-semibold text-white mt-6">Third Parties</h2>
		<p>Image data and transactions flow through public Nostr relays and Blossom servers. These are third-party services outside our control. Your Lightning Network payments are peer-to-peer and do not pass through our servers.</p>

		<h2 class="text-lg font-semibold text-white mt-6">Hosting</h2>
		<p>Zap Gallery is hosted on Vercel. Vercel's privacy policy applies to server request logs. We do not have access to or control over Vercel's infrastructure logging.</p>

		<h2 class="text-lg font-semibold text-white mt-6">Contact</h2>
		<p>Privacy questions? Find us on Nostr.</p>
	</div>
</div>

<Footer />
