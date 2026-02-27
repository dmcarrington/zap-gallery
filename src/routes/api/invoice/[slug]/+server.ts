import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { isNwcConfigured, makeInvoice } from '$lib/server/nwc';
import { storeInvoice } from '$lib/server/payments';

export const POST: RequestHandler = async ({ params, request }) => {
	const { slug } = params;

	if (!isNwcConfigured()) {
		return error(503, 'NWC wallet not configured');
	}

	const body = await request.json();
	const pubkey: string | undefined = body.pubkey;
	const priceSats: number | undefined = body.priceSats;

	if (!pubkey || !priceSats || !slug) {
		return error(400, 'Missing required fields: pubkey, priceSats');
	}

	let result;
	try {
		const amountMsats = priceSats * 1000;
		result = await makeInvoice(amountMsats, `Zap Gallery: ${slug}`);
	} catch (err) {
		console.error('[api/invoice] makeInvoice failed:', err);
		return error(502, 'Failed to create invoice from wallet');
	}

	const now = Math.floor(Date.now() / 1000);
	storeInvoice({
		paymentHash: result.payment_hash,
		slug,
		buyerPubkey: pubkey,
		bolt11: result.invoice,
		amountSats: priceSats,
		paid: false,
		createdAt: now,
		expiresAt: result.expiry || now + 600
	});

	return json({
		bolt11: result.invoice,
		paymentHash: result.payment_hash
	});
};
