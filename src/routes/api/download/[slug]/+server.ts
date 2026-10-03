import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getServerNdk, fetchEventsWithTimeout } from '$lib/server/ndk';
import NDK, { NDKEvent, NDKUser, NDKPrivateKeySigner } from '@nostr-dev-kit/ndk';
import { verifyInvoiceToken, isInvoiceSettled } from '$lib/server/payments';
import { fetchListing, isPubkeyHex } from '$lib/server/listings';
import type { GalleryImage } from '$lib/nostr/events';

const KIND_APP_DATA = 30078;
const KIND_ENCRYPTED_DM = 4;

interface ImageSecret {
	slug: string;
	url: string;
	key?: string; // absent on legacy unencrypted uploads
	mimeType: string;
}

/**
 * Release the full-res secret for an image once payment is verified.
 * Body: { pubkey: string (buyer), sellerPubkey: string, token?: string }
 * Returns: { url, mimeType, key? } — `key` decrypts the blob at `url`.
 */
export const POST: RequestHandler = async ({ params, request }) => {
	const { slug } = params;
	const body = await request.json().catch(() => ({}));
	const buyerPubkey = body?.pubkey;
	const sellerPubkey = body?.sellerPubkey;

	if (!slug || !isPubkeyHex(buyerPubkey) || !isPubkeyHex(sellerPubkey)) {
		return error(400, 'Missing or invalid fields: pubkey, sellerPubkey');
	}

	let serverNdk;
	try {
		serverNdk = await getServerNdk();
	} catch {
		return error(500, 'Server signing not configured');
	}
	const { ndk, signer } = serverNdk;

	// 1. The listing is the source of truth for price and event id
	const listing = await fetchListing(sellerPubkey, slug);
	if (!listing) {
		return error(404, 'Listing not found');
	}

	// 2. Verify the invoice token and check settlement with the wallet
	let paymentVerified = false;
	const claim = verifyInvoiceToken(body?.token);
	if (
		claim &&
		claim.slug === slug &&
		claim.sellerPubkey === sellerPubkey &&
		claim.buyerPubkey === buyerPubkey
	) {
		try {
			paymentVerified = await isInvoiceSettled(claim);
		} catch (err) {
			console.warn('[api/download] NWC lookup failed:', err);
		}
	}

	// 3. Legacy fallback: check zap receipts on relays
	if (!paymentVerified) {
		paymentVerified = await hasZapReceipt(ndk, listing, buyerPubkey);
	}

	if (!paymentVerified) {
		return error(402, 'No valid payment found. Please complete payment first.');
	}

	// 4. Retrieve the secret the seller stored for this image
	const secret = await fetchImageSecret(ndk, signer, listing);
	if (!secret) {
		return error(404, 'Image key not found');
	}

	// 5. Send DM to buyer in the background (fire and forget)
	sendDmToBuyer(ndk, signer, buyerPubkey, secret).catch((err) => {
		console.error('[api/download] Failed to send DM:', err);
	});

	// 6. Return the secret to the buyer immediately
	return json({ url: secret.url, mimeType: secret.mimeType, key: secret.key });
};

async function hasZapReceipt(
	ndk: NDK,
	listing: GalleryImage,
	buyerPubkey: string
): Promise<boolean> {
	const zapReceipts = await fetchEventsWithTimeout(
		ndk,
		{ kinds: [9735], '#e': [listing.eventId] },
		5000
	);

	for (const receipt of zapReceipts) {
		const descTag = receipt.tags.find((t) => t[0] === 'description');
		if (!descTag?.[1]) continue;

		try {
			const zapRequest = JSON.parse(descTag[1]);
			const senderPubkey = zapRequest.pubkey;
			const amountTag = zapRequest.tags?.find((t: string[]) => t[0] === 'amount');
			const amountMsats = amountTag ? parseInt(amountTag[1], 10) : 0;
			const amountSats = Math.floor(amountMsats / 1000);

			if (senderPubkey === buyerPubkey && amountSats >= listing.priceSats) {
				return true;
			}
		} catch {
			continue;
		}
	}
	return false;
}

async function fetchImageSecret(
	ndk: NDK,
	signer: NDKPrivateKeySigner,
	listing: GalleryImage
): Promise<ImageSecret | null> {
	const keyTag = `zap-gallery-key:${listing.slug}`;
	const legacyUrlTag = `zap-gallery-url:${listing.slug}`;

	const events = await fetchEventsWithTimeout(
		ndk,
		{
			kinds: [KIND_APP_DATA as number],
			authors: [listing.publisherPubkey],
			'#d': [keyTag, legacyUrlTag]
		},
		8000
	);

	const dTag = (e: NDKEvent) => e.tags.find((t) => t[0] === 'd')?.[1];
	const event = events.find((e) => dTag(e) === keyTag) ?? events.find((e) => dTag(e) === legacyUrlTag);

	if (event) {
		// The seller encrypted the secret to the gallery owner's pubkey
		const sellerUser = new NDKUser({ pubkey: listing.publisherPubkey });
		sellerUser.ndk = ndk;
		try {
			return JSON.parse(await signer.decrypt(sellerUser, event.content, 'nip04'));
		} catch (err) {
			console.error('[api/download] Failed to decrypt image secret:', err);
			return null;
		}
	}

	// Legacy listings published the unencrypted full-res URL in the listing itself
	if (listing.fullResUrl) {
		return { slug: listing.slug, url: listing.fullResUrl, mimeType: listing.mimeType };
	}
	return null;
}

async function sendDmToBuyer(
	ndk: NDK,
	signer: NDKPrivateKeySigner,
	buyerPubkey: string,
	secret: ImageSecret
): Promise<void> {
	const buyerUser = new NDKUser({ pubkey: buyerPubkey });
	buyerUser.ndk = ndk;

	const payload = JSON.stringify({
		type: 'zap-gallery-key',
		...secret
	});

	const encrypted = await signer.encrypt(buyerUser, payload, 'nip04');

	const event = new NDKEvent(ndk);
	event.kind = KIND_ENCRYPTED_DM;
	event.content = encrypted;
	event.tags = [['p', buyerPubkey]];

	await event.publish();
}
