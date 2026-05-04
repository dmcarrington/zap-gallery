/**
 * Tracks Pro upgrade invoices in-memory between issuance and verification.
 * Maps payment_hash → pubkey so we can bind a paid invoice to the buyer
 * when /api/pro/verify is called.
 *
 * Per-instance memory; the window between issuing an invoice and verifying
 * payment is short (seconds), so an instance restart is unlikely to matter.
 */

interface PendingProInvoice {
	pubkey: string;
	amountSats: number;
	createdAt: number; // unix seconds
	expiresAt: number; // unix seconds
}

const pending = new Map<string, PendingProInvoice>();

export function recordProInvoice(paymentHash: string, invoice: PendingProInvoice): void {
	pending.set(paymentHash, invoice);
}

export function getProInvoice(paymentHash: string): PendingProInvoice | undefined {
	return pending.get(paymentHash);
}

const CLEANUP_INTERVAL_MS = 10 * 60 * 1000;
setInterval(() => {
	const now = Math.floor(Date.now() / 1000);
	for (const [hash, inv] of pending) {
		if (inv.expiresAt < now) pending.delete(hash);
	}
}, CLEANUP_INTERVAL_MS);
