/**
 * Server-side listing lookup. Price and event id for a purchase always come
 * from the seller's signed kind 30024 event, never from the buyer's request.
 */

import { getServerNdk, fetchEventsWithTimeout } from './ndk';
import { parseImageEvent, KIND_IMAGE_LISTING, type GalleryImage } from '$lib/nostr/events';

const PUBKEY_HEX = /^[0-9a-f]{64}$/;

export function isPubkeyHex(value: unknown): value is string {
	return typeof value === 'string' && PUBKEY_HEX.test(value);
}

export async function fetchListing(
	sellerPubkey: string,
	slug: string
): Promise<GalleryImage | null> {
	const { ndk } = await getServerNdk();

	const events = await fetchEventsWithTimeout(
		ndk,
		{ kinds: [KIND_IMAGE_LISTING as number], authors: [sellerPubkey], '#d': [slug] },
		8000
	);

	// Replaceable event: relays may still hold older versions, so take the newest.
	const latest = events.sort((a, b) => (b.created_at ?? 0) - (a.created_at ?? 0))[0];
	return latest ? parseImageEvent(latest) : null;
}
