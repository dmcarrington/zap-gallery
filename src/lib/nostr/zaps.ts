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
 * Fetch zap receipts with a hard timeout.
 *
 * NDK's fetchEvents waits for EOSE from a majority of relays before
 * resolving. If even one relay is slow the promise can hang indefinitely.
 * This helper uses a raw subscription with a timeout so callers always
 * get a result.
 */
export function fetchZapReceipts(
	imageEventId: string,
	timeoutMs = 4000
): Promise<ZapReceipt[]> {
	return new Promise((resolve) => {
		const events = new Map<string, NDKEvent>();

		const sub: NDKSubscription = ndk.subscribe(
			{
				kinds: [KIND_ZAP_RECEIPT as number],
				'#e': [imageEventId]
			},
			{ closeOnEose: true }
		);

		const finish = () => {
			sub.stop();
			const receipts: ZapReceipt[] = [];
			for (const event of events.values()) {
				const receipt = parseZapReceipt(event);
				if (receipt) receipts.push(receipt);
			}
			resolve(receipts.sort((a, b) => b.createdAt - a.createdAt));
		};

		// Hard timeout — resolve with whatever we have so far
		const timer = setTimeout(finish, timeoutMs);

		sub.on('event', (event: NDKEvent) => {
			events.set(event.id, event);
		});

		sub.on('eose', () => {
			clearTimeout(timer);
			finish();
		});
	});
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
