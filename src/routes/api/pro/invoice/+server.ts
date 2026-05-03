import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { PRO_PRICE, storeSubscription } from '$lib/server/pro';
import { isNwcConfigured, makeInvoice, lookupInvoice } from '$lib/server/nwc';
import { storeInvoice } from '$lib/server/payments';

/**
 * Create a Pro subscription invoice.
 * POST { pubkey }
 * Returns { invoice, paymentHash, amountSats }
 */
export const POST: RequestHandler = async ({ request }) => {
	const body = await request.json();
	const pubkey: string | undefined = body.pubkey;

	if (!pubkey) {
		return error(400, 'Missing pubkey');
	}

	if (!isNwcConfigured()) {
		return error(503, 'NWC wallet not configured. Pro subscriptions require NWC.');
	}

	try {
		// Create Lightning invoice via NWC (amount in millisats)
		const amountMsats = PRO_PRICE * 1000; // NWC uses millisats
		const description = `Zap Gallery Pro - ${PRO_PRICE} sats`;
		const nwcResult = await makeInvoice(amountMsats, description);

		if (!nwcResult?.invoice) {
			return error(500, 'Failed to create Lightning invoice');
		}

		// Track this invoice for verification
		storeInvoice({
			paymentHash: nwcResult.payment_hash,
			slug: 'pro-subscription',
			buyerPubkey: pubkey,
			bolt11: nwcResult.invoice,
			amountSats: PRO_PRICE,
			paid: false,
			createdAt: Math.floor(Date.now() / 1000),
			expiresAt: Math.floor(Date.now() / 1000) + 3600
		});

		return json({
			invoice: nwcResult.invoice,
			paymentHash: nwcResult.payment_hash,
			amountSats: PRO_PRICE
		});
	} catch (err) {
		console.error('[api/pro/invoice] Error:', err);
		return error(500, 'Failed to create invoice');
	}
};
