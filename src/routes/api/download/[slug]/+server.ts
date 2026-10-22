import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getServerNdk, fetchEventsWithTimeout } from '$lib/server/ndk';
import NDK, { NDKEvent, NDKUser, NDKPrivateKeySigner } from '@nostr-dev-kit/ndk';
import { verifyInvoiceToken, isInvoiceSettled } from '$lib/server/payments';
import { fetchListing, isPubkeyHex } from '$lib/server/listings';
import { hasVerifiedZap } from '$lib/server/zapReceipts';
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
 * When paid by zap: { encrypted, sender } — the same JSON, NIP-44 encrypted to
 * the buyer. A zap is public, so anyone could name its buyer in the request;
 * only the buyer can read the reply.
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

	// 3. Otherwise look for a verified NIP-57 zap from the buyer to the seller
	let paidByZap = false;
	if (!paymentVerified) {
		paidByZap = await hasVerifiedZap(ndk, listing, buyerPubkey);
		paymentVerified = paidByZap;
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
	const reply = { url: secret.url, mimeType: secret.mimeType, key: secret.key };
	if (paidByZap) {
		const buyer = new NDKUser({ pubkey: buyerPubkey });
		const encrypted = await signer.encrypt(buyer, JSON.stringify(reply), 'nip44');
		return json({ encrypted, sender: (await signer.user()).pubkey });
	}
	return json(reply);
};

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
