/**
 * Zap receipt verification and monitoring (NIP-57).
 * Uses NDK's built-in zapInvoiceFromEvent for parsing.
 */

import { zapInvoiceFromEvent, type NDKEvent, type NDKSubscription } from '@nostr-dev-kit/ndk';
import { ndk } from '$lib/ndk';
import { KIND_ZAP_RECEIPT } from './events';

export interface ZapReceipt {
	receiptId: string;
	senderPubkey: string;
	recipientPubkey: string;
	zappedEventId?: string;
	amountMsats: number;
	amountSats: number;
	comment?: string;
	createdAt: number;
}

/**
 * Check if a pubkey has a valid zap receipt for a specific image event
 * that meets the minimum required amount.
 */
export async function hasValidZap(
	imageEventId: string,
	buyerPubkey: string,
	requiredSats: number
): Promise<boolean> {
	const receipts = await fetchZapReceipts(imageEventId);
	return receipts.some(
		(r) => r.senderPubkey === buyerPubkey && r.amountSats >= requiredSats
	);
}

/**
 * Fetch and parse all zap receipts for a given event.
 */
export async function fetchZapReceipts(imageEventId: string): Promise<ZapReceipt[]> {
	const events = await ndk.fetchEvents({
		kinds: [KIND_ZAP_RECEIPT as number],
		'#e': [imageEventId]
	});

	const receipts: ZapReceipt[] = [];
	for (const event of events) {
		const receipt = parseZapReceipt(event);
		if (receipt) receipts.push(receipt);
	}

	return receipts.sort((a, b) => b.createdAt - a.createdAt);
}

/**
 * Subscribe to zap receipts for an event in real-time.
 * Returns an unsubscribe function.
 */
export function watchZapReceipts(
	imageEventId: string,
	onReceipt: (receipt: ZapReceipt) => void
): () => void {
	const sub: NDKSubscription = ndk.subscribe(
		{
			kinds: [KIND_ZAP_RECEIPT as number],
			'#e': [imageEventId]
		},
		{ closeOnEose: false }
	);

	sub.on('event', (event: NDKEvent) => {
		const receipt = parseZapReceipt(event);
		if (receipt) onReceipt(receipt);
	});

	return () => sub.stop();
}

/**
 * Get aggregate zap stats for an event.
 */
export async function getZapStats(imageEventId: string): Promise<{
	totalSats: number;
	zapCount: number;
}> {
	const receipts = await fetchZapReceipts(imageEventId);
	return {
		totalSats: receipts.reduce((sum, r) => sum + r.amountSats, 0),
		zapCount: receipts.length
	};
}

function parseZapReceipt(event: NDKEvent): ZapReceipt | null {
	const invoice = zapInvoiceFromEvent(event);
	if (!invoice) return null;

	return {
		receiptId: event.id,
		senderPubkey: invoice.zappee, // zappee = the person who sent the zap
		recipientPubkey: invoice.zapped, // zapped = the person who received the zap
		zappedEventId: invoice.zappedEvent,
		amountMsats: invoice.amount,
		amountSats: Math.floor(invoice.amount / 1000),
		comment: invoice.comment,
		createdAt: event.created_at ?? 0
	};
}
