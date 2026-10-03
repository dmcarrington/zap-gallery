/**
 * Stateless invoice tracking.
 *
 * When an invoice is issued the server hands the buyer a signed token binding
 * the payment hash to the listing, seller, buyer and amount. Payment status is
 * always re-checked against the wallet over NWC, so nothing here needs to
 * survive a restart or be shared between serverless instances.
 */

import { createHmac, timingSafeEqual } from 'node:crypto';
import { env } from '$env/dynamic/private';
import { isNwcConfigured, lookupInvoice } from './nwc';

export interface InvoiceClaim {
	paymentHash: string;
	slug: string;
	sellerPubkey: string;
	buyerPubkey: string;
	amountSats: number;
}

function sign(payload: string): Buffer {
	const nsec = env.GALLERY_OWNER_NSEC;
	if (!nsec) throw new Error('GALLERY_OWNER_NSEC not configured');
	// Derive a dedicated MAC key so the nsec itself is never used directly.
	const key = createHmac('sha256', nsec).update('zap-gallery-invoice-token-v1').digest();
	return createHmac('sha256', key).update(payload).digest();
}

export function signInvoiceToken(claim: InvoiceClaim): string {
	const payload = Buffer.from(JSON.stringify(claim)).toString('base64url');
	return `${payload}.${sign(payload).toString('base64url')}`;
}

export function verifyInvoiceToken(token: unknown): InvoiceClaim | null {
	if (typeof token !== 'string') return null;
	const [payload, mac, ...rest] = token.split('.');
	if (!payload || !mac || rest.length) return null;

	const given = Buffer.from(mac, 'base64url');
	const expected = sign(payload);
	if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;

	try {
		return JSON.parse(Buffer.from(payload, 'base64url').toString()) as InvoiceClaim;
	} catch {
		return null;
	}
}

/** Per-instance cache of settled payment hashes; only saves repeat NWC lookups. */
const settled = new Set<string>();

export async function isInvoiceSettled(claim: InvoiceClaim): Promise<boolean> {
	if (settled.has(claim.paymentHash)) return true;
	if (!isNwcConfigured()) return false;

	const result = await lookupInvoice(claim.paymentHash);
	if (!result.settled_at) return false;
	// NIP-47 amounts are msats
	if (typeof result.amount === 'number' && result.amount < claim.amountSats * 1000) return false;

	settled.add(claim.paymentHash);
	return true;
}
