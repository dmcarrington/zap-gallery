import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getServerNdk } from '$lib/server/ndk';
import { GALLERY_OWNER_PUBKEY } from '$lib/config';
import { getInvoice, markPaid, invoiceStore } from '$lib/server/payments';
import { isNwcConfigured, lookupInvoice } from '$lib/server/nwc';
import { ZapPaymentSDK, ZapImageSDK, PaymentStatus } from 'zap-gallery-sdk';

export const POST: RequestHandler = async ({ params, request }) => {
	const { slug } = params;
	const body = await request.json();
	const buyerPubkey: string | undefined = body.pubkey;
	const imageEventId: string | undefined = body.eventId;
	const requiredSats: number | undefined = body.priceSats;
	const paymentHash: string | undefined = body.paymentHash;

	if (!buyerPubkey || !imageEventId || !requiredSats || !slug) {
		return error(400, 'Missing required fields: pubkey, eventId, priceSats');
	}

	// If the client supplied a specific paymentHash, give NWC a chance to
	// confirm it before we consult the invoice store or zap receipts.
	if (paymentHash && isNwcConfigured()) {
		const invoice = getInvoice(paymentHash);
		if (invoice && invoice.slug === slug && invoice.buyerPubkey === buyerPubkey) {
			try {
				const result = await lookupInvoice(paymentHash);
				if (result.settled_at) markPaid(paymentHash);
			} catch (err) {
				console.warn('[api/download] NWC lookup failed:', err);
			}
		}
	}

	let serverNdk;
	try {
		serverNdk = await getServerNdk();
	} catch {
		return error(500, 'Server signing not configured');
	}
	const { ndk, signer } = serverNdk;

	const paymentSdk = new ZapPaymentSDK(ndk, GALLERY_OWNER_PUBKEY, { invoiceStore });
	const verification = await paymentSdk.verifyPayment({
		slug,
		buyerPubkey,
		imageEventId,
		priceSats: requiredSats,
		paymentHash
	});

	if (verification.status !== PaymentStatus.PAID) {
		return error(402, 'No valid payment found. Please complete payment first.');
	}

	const imageSdk = ZapImageSDK.fromNdk({
		ndk,
		signer,
		ownerPubkey: GALLERY_OWNER_PUBKEY
	});

	try {
		const { url, mimeType } = await imageSdk.getFullResUrl(buyerPubkey, slug);
		return json({ url, mimeType });
	} catch (err) {
		const message = err instanceof Error ? err.message : 'Failed to retrieve image URL';
		const status = message.includes('not found') ? 404 : 500;
		return error(status, message);
	}
};
