<script lang="ts">
	import Footer from '$lib/components/Footer.svelte';
</script>

<div class="container mx-auto px-4 py-8 max-w-2xl">
	<h1 class="text-2xl font-bold text-white mb-6">Terms of Service</h1>

	<div class="prose prose-invert prose-sm max-w-none text-gray-300 space-y-4">
		<p><strong>Last updated:</strong> May 2026</p>

		<h2 class="text-lg font-semibold text-white mt-6">1. Service Description</h2>
		<p>Zap Gallery is a decentralized image marketplace. We provide a web interface for browsing, purchasing, and downloading images hosted on the Nostr network and Blossom storage servers. We do not host, store, or control any user content.</p>

		<h2 class="text-lg font-semibold text-white mt-6">2. Content Liability</h2>
		<p>All images listed on Zap Gallery are stored on Blossom servers and indexed via Nostr relays — infrastructure we do not own or control. Image sellers are solely responsible for the content they upload. Zap Gallery operates as an index, not a host. If you believe content infringes your rights, contact the Blossom server operator or Nostr relay operators directly.</p>

		<h2 class="text-lg font-semibold text-white mt-6">3. Payments</h2>
		<p>All transactions are conducted via the Lightning Network using Bitcoin. Payments are non-refundable and irreversible by nature of the Lightning Network. Zap Gallery does not custody funds — payments are peer-to-peer between buyer and seller.</p>

		<h2 class="text-lg font-semibold text-white mt-6">4. Pro Tier</h2>
		<p>Pro subscriptions are billed monthly via Lightning Network invoices. Pro features are unlocked upon confirmed payment. Subscriptions do not auto-renew — you will be prompted to pay again at the end of each billing period.</p>

		<h2 class="text-lg font-semibold text-white mt-6">5. No Warranty</h2>
		<p>The service is provided "as is" without warranty of any kind. We make no guarantees about availability, image quality, or seller reliability.</p>

		<h2 class="text-lg font-semibold text-white mt-6">6. Governing Law</h2>
		<p>These terms are governed by the laws of England and Wales.</p>

		<h2 class="text-lg font-semibold text-white mt-6">7. Contact</h2>
		<p>For questions, reach out via Nostr or Lightning. We have no email, no support ticket system, and no office.</p>
	</div>
</div>

<Footer />
