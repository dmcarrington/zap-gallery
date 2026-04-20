/**
 * Aggregate zap stats for an event (sum sats + count).
 *
 * Zap receipt verification and real-time subscription live in
 * zap-gallery-sdk's ZapPaymentSDK; this module only retains the
 * aggregate stats helper because the SDK doesn't cover it.
 */

import { zapInvoiceFromEvent, type NDKEvent, type NDKSubscription } from '@nostr-dev-kit/ndk';
import { ndk } from '$lib/ndk';
import { KIND_ZAP_RECEIPT } from './events';

/**
 * Fetch zap receipts for an event with a hard timeout.
 *
 * NDK's fetchEvents waits for EOSE from a majority of relays; a single
 * slow relay can stall it indefinitely. This helper uses a raw
 * subscription and resolves on the sooner of EOSE or timeout.
 */
function fetchZapReceiptAmounts(
	imageEventId: string,
	timeoutMs: number
): Promise<number[]> {
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
			const amounts: number[] = [];
			for (const event of events.values()) {
				const invoice = zapInvoiceFromEvent(event);
				if (invoice) amounts.push(Math.floor(invoice.amount / 1000));
			}
			resolve(amounts);
		};

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

export async function getZapStats(imageEventId: string): Promise<{
	totalSats: number;
	zapCount: number;
}> {
	const amounts = await fetchZapReceiptAmounts(imageEventId, 4000);
	return {
		totalSats: amounts.reduce((sum, a) => sum + a, 0),
		zapCount: amounts.length
	};
}
