import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { lookupInvoice } from '$lib/server/nwc';
import { getSellerPassInvoice } from '$lib/server/sellerPassPayments';
import { addSeller, getSellerExpiry, isActiveSeller } from '$lib/server/sellerRegistry';
import { SELLER_PASS_DURATION_DAYS, SINGLE_OWNER_MODE } from '$lib/config';

const PUBKEY_HEX = /^[0-9a-f]{64}$/i;

/**
 * GET /api/seller-pass/verify?pubkey=<hex>
 * Read-only seller pass check from the on-chain seller registry.
 * Returns: { active: boolean, expiresAt: number | null }
 */
export const GET: RequestHandler = async ({ url }) => {
	const pubkey = url.searchParams.get('pubkey');
	if (!pubkey || !PUBKEY_HEX.test(pubkey)) {
		return error(400, 'Invalid pubkey');
	}

	try {
		const [active, expiresAt] = await Promise.all([
			isActiveSeller(pubkey),
			getSellerExpiry(pubkey)
		]);
		return json({ active, expiresAt });
	} catch (err) {
		console.error('[api/seller-pass/verify GET]', err);
		return json({ active: false, expiresAt: null });
	}
};

/**
 * POST /api/seller-pass/verify
 * Body: { pubkey, paymentHash }
 * Looks up the invoice on the wallet, confirms it's settled and was issued
 * for this pubkey, then adds (or extends) the buyer in the seller registry.
 * Returns: { active: true, paid: true, expiresAt }
 */
export const POST: RequestHandler = async ({ request }) => {
	if (SINGLE_OWNER_MODE) return error(404, 'Not found');
	const body = await request.json().catch(() => ({}));
	const pubkey: string | undefined = body?.pubkey;
	const paymentHash: string | undefined = body?.paymentHash;

	if (!pubkey || !PUBKEY_HEX.test(pubkey)) return error(400, 'Invalid pubkey');
	if (!paymentHash || typeof paymentHash !== 'string') return error(400, 'Invalid paymentHash');

	const pending = getSellerPassInvoice(paymentHash);
	if (!pending) return error(404, 'Invoice not found or expired');
	if (pending.pubkey !== pubkey) return error(403, 'Invoice was issued for a different pubkey');

	let lookup;
	try {
		lookup = await lookupInvoice(paymentHash);
	} catch (err) {
		console.error('[api/seller-pass/verify POST] lookupInvoice failed', err);
		return error(502, 'Failed to look up invoice on wallet');
	}

	if (!lookup.settled_at) {
		return json({ active: false, paid: false }, { status: 402 });
	}

	const now = Math.floor(Date.now() / 1000);
	const existingExpiry = (await getSellerExpiry(pubkey)) ?? 0;
	const base = Math.max(existingExpiry, now);
	const expiresAt = base + SELLER_PASS_DURATION_DAYS * 24 * 60 * 60;

	try {
		await addSeller(pubkey, expiresAt);
	} catch (err) {
		console.error('[api/seller-pass/verify POST] addSeller failed', err);
		return error(500, 'Payment confirmed but registry update failed; please contact support');
	}

	return json({ active: true, paid: true, expiresAt });
};
