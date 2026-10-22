/**
 * Tracks seller pass invoices in-memory between issuance and verification.
 * Maps payment_hash → pubkey so we can bind a paid invoice to the buyer
 * when /api/seller-pass/verify is called.
 *
 * Per-instance memory; the window between issuing an invoice and verifying
 * payment is short (seconds), so an instance restart is unlikely to matter.
 */

interface PendingSellerPassInvoice {
	pubkey: string;
	amountSats: number;
	createdAt: number; // unix seconds
	expiresAt: number; // unix seconds
}

const pending = new Map<string, PendingSellerPassInvoice>();

export function recordSellerPassInvoice(paymentHash: string, invoice: PendingSellerPassInvoice): void {
	pending.set(paymentHash, invoice);
}

export function getSellerPassInvoice(paymentHash: string): PendingSellerPassInvoice | undefined {
	return pending.get(paymentHash);
}

const CLEANUP_INTERVAL_MS = 10 * 60 * 1000;
setInterval(() => {
	const now = Math.floor(Date.now() / 1000);
	for (const [hash, inv] of pending) {
		if (inv.expiresAt < now) pending.delete(hash);
	}
}, CLEANUP_INTERVAL_MS);
