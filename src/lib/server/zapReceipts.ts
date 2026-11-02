/**
 * Server-side verification of NIP-57 zap purchases.
 *
 * A zap receipt (kind 9735) is only trusted when it is signed by the
 * `nostrPubkey` of the seller's own Lightning provider. The provider works
 * for the seller, so a false receipt could only cost the seller. The embedded
 * zap request must be signed by the buyer and point at the listing, and the
 * invoice must cover the price.
 *
 * NIP-57 says the invoice's description hash should commit to the zap
 * request, but real providers don't reliably do it (Alby and npub.cash send a
 * plain description; Primal's hash doesn't match its own receipt), so the
 * provider's signature is what binds request and invoice.
 */

import { decode } from 'light-bolt11-decoder';
import { verifyEvent, type Event } from 'nostr-tools';
import type NDK from '@nostr-dev-kit/ndk';
import { fetchEventsWithTimeout } from './ndk';
import { fetchZapEndpoint, invoiceAmountMsats, profileLud16, type ZapEndpoint } from '$lib/nostr/lnurl';
import { KIND_IMAGE_LISTING, type GalleryImage } from '$lib/nostr/events';

const KIND_ZAP_REQUEST = 9734;
const KIND_ZAP_RECEIPT = 9735;
const ENDPOINT_TTL_MS = 10 * 60 * 1000;

/** Per-instance cache; a seller's Lightning address rarely changes. */
const endpoints = new Map<string, { endpoint: ZapEndpoint | null; at: number }>();

export async function getSellerZapEndpoint(
	ndk: NDK,
	sellerPubkey: string
): Promise<ZapEndpoint | null> {
	const cached = endpoints.get(sellerPubkey);
	if (cached && Date.now() - cached.at < ENDPOINT_TTL_MS) return cached.endpoint;

	const profiles = await fetchEventsWithTimeout(ndk, { kinds: [0], authors: [sellerPubkey] }, 5000);
	const latest = profiles.sort((a, b) => (b.created_at ?? 0) - (a.created_at ?? 0))[0];
	const lud16 = latest ? profileLud16(latest.content) : null;
	const endpoint = lud16 ? await fetchZapEndpoint(lud16) : null;

	endpoints.set(sellerPubkey, { endpoint, at: Date.now() });
	return endpoint;
}

/** True if a verified zap from `buyerPubkey` paid for `listing`. */
export async function hasVerifiedZap(
	ndk: NDK,
	listing: GalleryImage,
	buyerPubkey: string
): Promise<boolean> {
	const endpoint = await getSellerZapEndpoint(ndk, listing.publisherPubkey);
	if (!endpoint) return false;

	// The `a` coordinate survives listing edits; the `e` id does not
	const coordinate = `${KIND_IMAGE_LISTING}:${listing.publisherPubkey}:${listing.slug}`;
	const receipts = await fetchEventsWithTimeout(
		ndk,
		[
			{ kinds: [KIND_ZAP_RECEIPT], authors: [endpoint.nostrPubkey], '#a': [coordinate] },
			{ kinds: [KIND_ZAP_RECEIPT], authors: [endpoint.nostrPubkey], '#e': [listing.eventId] }
		],
		5000
	);

	return receipts.some((receipt) =>
		isValidPurchase(receipt.rawEvent() as Event, endpoint, listing, buyerPubkey)
	);
}

function tag(event: Event, name: string): string | undefined {
	return event.tags.find((t) => t[0] === name)?.[1];
}

/** Exported for tests; `hasVerifiedZap` is the entry point. */
export function isValidPurchase(
	receipt: Event,
	endpoint: Pick<ZapEndpoint, 'nostrPubkey'>,
	listing: Pick<GalleryImage, 'publisherPubkey' | 'slug' | 'eventId' | 'priceSats'>,
	buyerPubkey: string
): boolean {
	const coordinate = `${KIND_IMAGE_LISTING}:${listing.publisherPubkey}:${listing.slug}`;
	if (receipt.kind !== KIND_ZAP_RECEIPT || receipt.pubkey !== endpoint.nostrPubkey) return false;
	if (!verifyEvent(receipt)) return false;

	const description = tag(receipt, 'description');
	const bolt11 = tag(receipt, 'bolt11');
	if (!description || !bolt11) return false;

	let request: Event;
	try {
		request = JSON.parse(description);
	} catch {
		return false;
	}
	if (request.kind !== KIND_ZAP_REQUEST || request.pubkey !== buyerPubkey) return false;
	if (!verifyEvent(request)) return false;
	if (tag(request, 'p') !== listing.publisherPubkey) return false;
	if (tag(request, 'a') !== coordinate && tag(request, 'e') !== listing.eventId) return false;

	let sections: { name: string; value?: unknown }[];
	try {
		sections = decode(bolt11).sections;
	} catch {
		return false;
	}

	const amountMsats = invoiceAmountMsats(sections);
	if (amountMsats === null || amountMsats < listing.priceSats * 1000) return false;

	const requestedAmount = tag(request, 'amount');
	if (requestedAmount && Number(requestedAmount) !== amountMsats) return false;

	return true;
}
