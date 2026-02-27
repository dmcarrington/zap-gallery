/**
 * In-memory payment tracker for server-side invoice management.
 * Tracks invoices created via NWC and their payment status.
 */

export interface PendingInvoice {
	paymentHash: string;
	slug: string;
	buyerPubkey: string;
	bolt11: string;
	amountSats: number;
	paid: boolean;
	createdAt: number; // unix seconds
	expiresAt: number; // unix seconds
}

/** Primary index: paymentHash → invoice */
const invoices = new Map<string, PendingInvoice>();

/** Secondary index: "slug:pubkey" → set of paymentHashes */
const buyerIndex = new Map<string, Set<string>>();

function buyerKey(slug: string, pubkey: string): string {
	return `${slug}:${pubkey}`;
}

export function storeInvoice(invoice: PendingInvoice): void {
	invoices.set(invoice.paymentHash, invoice);

	const key = buyerKey(invoice.slug, invoice.buyerPubkey);
	let hashes = buyerIndex.get(key);
	if (!hashes) {
		hashes = new Set();
		buyerIndex.set(key, hashes);
	}
	hashes.add(invoice.paymentHash);
}

export function getInvoice(paymentHash: string): PendingInvoice | undefined {
	return invoices.get(paymentHash);
}

export function markPaid(paymentHash: string): void {
	const invoice = invoices.get(paymentHash);
	if (invoice) invoice.paid = true;
}

export function hasPaidInvoice(slug: string, pubkey: string): boolean {
	const hashes = buyerIndex.get(buyerKey(slug, pubkey));
	if (!hashes) return false;

	for (const hash of hashes) {
		const invoice = invoices.get(hash);
		if (invoice?.paid) return true;
	}
	return false;
}

/** Clean up expired unpaid invoices every 10 minutes */
const CLEANUP_INTERVAL_MS = 10 * 60 * 1000;

function cleanup(): void {
	const now = Math.floor(Date.now() / 1000);

	for (const [hash, invoice] of invoices) {
		if (!invoice.paid && invoice.expiresAt < now) {
			invoices.delete(hash);

			const key = buyerKey(invoice.slug, invoice.buyerPubkey);
			const hashes = buyerIndex.get(key);
			if (hashes) {
				hashes.delete(hash);
				if (hashes.size === 0) buyerIndex.delete(key);
			}
		}
	}
}

setInterval(cleanup, CLEANUP_INTERVAL_MS);
