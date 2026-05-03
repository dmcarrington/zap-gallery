import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getSubscription, isPro, storeSubscription } from '$lib/server/pro';
import { hasPaidInvoice, getInvoice, markPaid } from '$lib/server/payments';
import { isNwcConfigured, lookupInvoice } from '$lib/server/nwc';

/**
 * Verify Pro subscription status for a pubkey.
 *
 * GET /api/pro/verify?pubkey=xxx
 * Returns { pro: boolean, expiresAt?: string }
 *
 * POST /api/pro/verify
 * Body: { pubkey, paymentHash }
 * Verifies payment and activates Pro if valid.
 * Returns { pro: boolean, expiresAt?: string }
 */
export const GET: RequestHandler = async ({ url }) => {
	const pubkey = url.searchParams.get('pubkey');
	if (!pubkey) return error(400, 'Missing pubkey parameter');

	const sub = getSubscription(pubkey);

	return json({
		pro: sub !== undefined,
		expiresAt: sub ? new Date(sub.expiresAt * 1000).toISOString() : null
	});
};

export const POST: RequestHandler = async ({ request }) => {
	const body = await request.json();
	const pubkey: string | undefined = body.pubkey;
	const paymentHash: string | undefined = body.paymentHash;

	if (!pubkey || !paymentHash) {
		return error(400, 'Missing pubkey or paymentHash');
	}

	// Already Pro?
	if (isPro(pubkey)) {
		const sub = getSubscription(pubkey);
		return json({
			pro: true,
			expiresAt: sub ? new Date(sub.expiresAt * 1000).toISOString() : null
		});
	}

	// Check in-memory first
	let paid = hasPaidInvoice('pro-subscription', pubkey);

	// If not in-memory, check NWC
	if (!paid && isNwcConfigured()) {
		try {
			const invoice = getInvoice(paymentHash);
			if (invoice && invoice.slug === 'pro-subscription' && invoice.buyerPubkey === pubkey) {
				const result = await lookupInvoice(paymentHash);
				if (result.settled_at) {
					markPaid(paymentHash);
					paid = true;
				}
			}
		} catch (err) {
			console.warn('[api/pro/verify] NWC lookup failed:', err);
		}
	}

	if (!paid) {
		return json({ pro: false });
	}

	// Payment confirmed — activate Pro
	const now = Math.floor(Date.now() / 1000);
	const expiresAt = now + 30 * 24 * 60 * 60; // 30 days

	storeSubscription({
		pubkey,
		paidAt: now,
		expiresAt,
		invoiceHash: paymentHash
	});

	return json({
		pro: true,
		expiresAt: new Date(expiresAt * 1000).toISOString()
	});
};
