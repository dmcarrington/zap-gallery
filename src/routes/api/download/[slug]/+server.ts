import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { GALLERY_OWNER_PUBKEY } from '$lib/config';
import { KIND_APP_DATA } from '$lib/nostr/events';
import { getServerNdk } from '$lib/server/ndk';
import { hasValidZap } from '$lib/nostr/zaps';
import { hasPaidInvoice, getInvoice, markPaid } from '$lib/server/payments';
import { nip44 } from 'nostr-tools';

/**
 * Download endpoint — single-owner and multi-seller support.
 *
 * GET /api/download/[slug]?pubkey=buyer_pubkey&invoice=payment_hash
 *
 * Flow:
 * 1. Fetch the kind 30024 listing for this slug
 * 2. Extract the seller_pubkey from the listing
 * 3. Fetch kind 30078 app data (encrypted URL)
 * 4. Verify buyer paid the seller (invoice hash or zap receipt)
 * 5. Decrypt full-res URL with server's nsec
 * 6. Return download URL
 */
export const GET: RequestHandler = async ({ params, url }) => {
	const { slug } = params;

	const buyerPubkey = url.searchParams.get('pubkey');
	const invoiceHash = url.searchParams.get('invoice');

	if (!buyerPubkey) {
		return error(400, 'Missing pubkey parameter');
	}

	try {
		// 1. Find the listing event (kind 30024)
		let listing: any;
		try {
			const { ndk } = await getServerNdk();
			const filter: any = { kinds: [30024] };

			if (slug.includes('/')) {
				// slug contains pubkey, format: pubkey/slug for multi-seller
				const [authorPubkey, ...rest] = slug.split('/');
				filter.authors = [authorPubkey];
				filter['#d'] = [rest.join('/')];
			} else {
				// Default: search the gallery owner's events
				filter.authors = [GALLERY_OWNER_PUBKEY];
				filter['#d'] = [slug];
			}

			const listingEvents = await ndk.fetchEvents(filter);
			if (listingEvents.size === 0) {
				return error(404, 'Image listing not found');
			}

			for (const ev of listingEvents) {
				listing = ev;
				break; // take the first match
			}
		} catch (e) {
			console.error('[download] Failed to fetch listing:', e);
			return error(404, 'Image listing not found');
		}

		const imageSha256 = listing.tagValue('image');
		const sellerPubkey = listing.pubkey; // who published the listing
		const listingPrice = Number(listing.tagValue('price') || 0);

		if (!imageSha256) {
			return error(500, 'Missing image hash in listing');
		}

		// 2. Payment verification
		let paymentVerified = false;

		if (invoiceHash) {
			// Check if invoice exists and belongs to this buyer for this listing
			const invoice = getInvoice(invoiceHash);
			if (invoice && invoice.slug === listing.tagValue('d') && invoice.buyerPubkey === buyerPubkey) {
				paymentVerified = true;
				markPaid(invoiceHash);
			}
		}

		// Fallback: verify zap receipt on Nostr
		if (!paymentVerified && listing.priceSats && listing.priceSats > 0) {
			paymentVerified = await hasValidZap(buyerPubkey, listing.id);
		}

		if (!paymentVerified) {
			return error(402, 'Payment not confirmed for this download');
		}

		// 3. Fetch kind 30078 app data (encrypted URL)
		let encryptedUrl: string | null = null;

		const appDataEventId = listing.tagValue('app_data');
		if (appDataEventId) {
			try {
				const { ndk } = await getServerNdk();
				const appDataEvent = await ndk.fetchEvent({
					ids: [appDataEventId]
				});

				if (appDataEvent) {
					const data = JSON.parse(appDataEvent.content);
					encryptedUrl = data.url;
				}
			} catch (e) {
				console.warn('[download] Failed to fetch app data event:', e);
			}
		} else {
			// Legacy: search for app data by sha256
			try {
				const { ndk } = await getServerNdk();
				const appDataEvents = await ndk.fetchEvents({
					kinds: [KIND_APP_DATA],
					authors: [sellerPubkey],
					'#sha256': [imageSha256]
				});

				for (const ev of appDataEvents) {
					const data = JSON.parse(ev.content);
					encryptedUrl = data.url;
					break;
				}
			} catch (e) {
				console.warn('[download] Failed to fetch app data by sha256:', e);
			}
		}

		if (!encryptedUrl) {
			return error(500, 'Failed to retrieve download URL');
		}

		// 4. Decrypt URL with server's nsec
		const { signer } = await getServerNdk();
		const serverPrivkey = (signer as any).privateKey;
		const serverPubkey = (await signer.user()).pubkey;

		if (!serverPrivkey) {
			return error(500, 'Server decryption key not configured');
		}

		let downloadUrl: string;
		try {
			const conversationKey = nip44.v2.utils.getConversationKey(serverPrivkey, serverPubkey);
			downloadUrl = nip44.decrypt(encryptedUrl, conversationKey);
		} catch (e) {
			console.error('[download] Decryption failed:', e);
			return error(500, 'Failed to decrypt download URL');
		}

		return json({ url: downloadUrl });
	} catch (err) {
		console.error('[download] Error:', err);
		return error(500, 'Download failed');
	}
};
