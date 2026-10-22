import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { isNwcConfigured, makeInvoice } from '$lib/server/nwc';
import { recordSellerPassInvoice } from '$lib/server/sellerPassPayments';
import { SELLER_PASS_PRICE_SATS, SELLER_PASS_DURATION_DAYS, SINGLE_OWNER_MODE } from '$lib/config';

const PUBKEY_HEX = /^[0-9a-f]{64}$/i;
const INVOICE_TTL_SECS = 15 * 60; // 15 minutes to pay

/**
 * Create a Lightning invoice for a seller pass tied to a buyer pubkey.
 * Body: { pubkey: string }
 * Returns: { bolt11, paymentHash, amountSats, expiresAt }
 */
export const POST: RequestHandler = async ({ request }) => {
	if (SINGLE_OWNER_MODE) return error(404, 'Not found');
	if (!isNwcConfigured()) {
		return error(503, 'Lightning payments not configured');
	}

	const body = await request.json().catch(() => ({}));
	const pubkey = body?.pubkey;
	if (typeof pubkey !== 'string' || !PUBKEY_HEX.test(pubkey)) {
		return error(400, 'Invalid pubkey');
	}

	try {
		const description = `Zap Gallery seller pass (${SELLER_PASS_DURATION_DAYS}d) — ${pubkey.slice(0, 8)}…`;
		const invoice = await makeInvoice(SELLER_PASS_PRICE_SATS * 1000, description);

		const now = Math.floor(Date.now() / 1000);
		recordSellerPassInvoice(invoice.payment_hash, {
			pubkey,
			amountSats: SELLER_PASS_PRICE_SATS,
			createdAt: now,
			expiresAt: now + INVOICE_TTL_SECS
		});

		return json({
			bolt11: invoice.invoice,
			paymentHash: invoice.payment_hash,
			amountSats: SELLER_PASS_PRICE_SATS,
			expiresAt: now + INVOICE_TTL_SECS
		});
	} catch (err) {
		console.error('[api/seller-pass/invoice]', err);
		return error(502, 'Failed to create invoice');
	}
};
