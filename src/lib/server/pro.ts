/**
 * Server-side Pro subscription tracker.
 * Tracks active Pro subscriptions in-memory.
 * In prod, this would be backed by a database.
 */

const PRO_PRICE_SATS = 100_000; // £5/mo equivalent
const PRO_DURATION_DAYS = 30;

export interface ProSubscription {
	pubkey: string;
	paidAt: number; // unix seconds
	expiresAt: number; // unix seconds
	invoiceHash?: string; // payment hash for verification
}

const subscriptions = new Map<string, ProSubscription>();

export function storeSubscription(sub: ProSubscription): void {
	subscriptions.set(sub.pubkey, sub);
}

export function getSubscription(pubkey: string): ProSubscription | undefined {
	const sub = subscriptions.get(pubkey);
	if (!sub) return undefined;

	// Check if still active
	if (sub.expiresAt < Math.floor(Date.now() / 1000)) {
		subscriptions.delete(pubkey);
		return undefined;
	}

	return sub;
}

export function isPro(pubkey: string): boolean {
	return getSubscription(pubkey) !== undefined;
}

export function getProPriceSats(): number {
	return PRO_PRICE_SATS;
}

export function getProExpiryDate(pubkey: string): string | null {
	const sub = getSubscription(pubkey);
	if (!sub) return null;
	return new Date(sub.expiresAt * 1000).toISOString();
}

/** Clean up expired subscriptions periodically */
const CLEANUP_INTERVAL_MS = 30 * 60 * 1000;

function cleanup(): void {
	const now = Math.floor(Date.now() / 1000);
	for (const [pubkey, sub] of subscriptions) {
		if (sub.expiresAt < now) {
			subscriptions.delete(pubkey);
		}
	}
}

setInterval(cleanup, CLEANUP_INTERVAL_MS);

export { PRO_PRICE_SATS as PRO_PRICE };
