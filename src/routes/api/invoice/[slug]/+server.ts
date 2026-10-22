import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { isNwcConfigured, makeInvoice } from '$lib/server/nwc';
import { signInvoiceToken } from '$lib/server/payments';
import { fetchListing, isPubkeyHex } from '$lib/server/listings';

/**
 * Create a Lightning invoice for an image, priced from the seller's listing.
 * Body: { pubkey: string (buyer), sellerPubkey: string }
 * Returns: { bolt11, paymentHash, token, amountSats }
 */
export const POST: RequestHandler = async ({ params, request }) => {
	const { slug } = params;

	if (!isNwcConfigured()) {
		return error(503, 'NWC wallet not configured');
	}

	const body = await request.json().catch(() => ({}));
	const buyerPubkey = body?.pubkey;
	const sellerPubkey = body?.sellerPubkey;

	if (!slug || !isPubkeyHex(buyerPubkey) || !isPubkeyHex(sellerPubkey)) {
		return error(400, 'Missing or invalid fields: pubkey, sellerPubkey');
	}

	let listing;
	try {
		listing = await fetchListing(sellerPubkey, slug);
	} catch {
		return error(500, 'Server signing not configured');
	}
	if (!listing) {
		return error(404, 'Listing not found');
	}
	if (!Number.isFinite(listing.priceSats) || listing.priceSats < 1) {
		return error(400, 'Listing is not for sale');
	}

	let result;
	try {
		result = await makeInvoice(listing.priceSats * 1000, `Zap Gallery: ${slug}`);
	} catch (err) {
		console.error('[api/invoice] makeInvoice failed:', err);
		return error(502, 'Failed to create invoice from wallet');
	}

	const token = signInvoiceToken({
		paymentHash: result.payment_hash,
		slug,
		sellerPubkey,
		buyerPubkey,
		amountSats: listing.priceSats
	});

	return json({
		bolt11: result.invoice,
		paymentHash: result.payment_hash,
		token,
		amountSats: listing.priceSats
	});
};
