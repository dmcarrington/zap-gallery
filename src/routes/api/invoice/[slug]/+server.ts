import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { ZapPaymentSDK } from 'zap-gallery-sdk';
import { getServerNdk } from '$lib/server/ndk';

export const POST: RequestHandler = async ({ params, request }) => {
	const { slug } = params;

	const body = await request.json();
	const pubkey: string | undefined = body.pubkey;
	const priceSats: number | undefined = body.priceSats;

	if (!pubkey || !priceSats || !slug) {
		return error(400, 'Missing required fields: pubkey, priceSats');
	}

	let serverNdk;
	try {
		serverNdk = await getServerNdk();
	} catch {
		return error(500, 'Server signing not configured');
	}

	const { ndk } = serverNdk;
	const payment = new ZapPaymentSDK(ndk);

	const result = await payment.verifyPayment({
		slug,
		buyerPubkey: pubkey,
		imageEventId: params.imageEventId || 'unknown',
		priceSats
	});

	if (result.status !== 'paid') {
		return error(402, 'Payment not verified');
	}

	return json({
		status: 'verified',
		amountSats: result.amountSats
	});
};
