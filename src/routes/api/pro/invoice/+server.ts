import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { isNwcConfigured, makeInvoice } from '$lib/server/nwc';

export const POST: RequestHandler = async ({ request }) => {
	if (!isNwcConfigured()) {
		return error(503, 'NWC wallet not configured');
	}

	const body = await request.json();
	const pubkey: string | undefined = body.pubkey;
	const tier: string | undefined = body.tier;

	if (!pubkey) {
		return error(400, 'Missing required field: pubkey');
	}

	if (tier !== 'pro') {
		return error(400, 'Invalid tier');
	}

	const amountMsats = 100000; // £5/mo ≈ 100k sats (adjust based on current BTC price)

	let result;
	try {
		result = await makeInvoice(amountMsats, `Zap Gallery Pro: ${pubkey.substring(0, 8)}...`);
	} catch (err) {
		console.error('[api/pro/invoice] makeInvoice failed:', err);
		return error(502, 'Failed to create invoice from wallet');
	}

	return json({
		bolt11: result.invoice,
		paymentHash: result.payment_hash,
		amountSats: Math.floor(amountMsats / 1000)
	});
};
