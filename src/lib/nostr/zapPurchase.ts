/**
 * Buyer side of a NIP-57 zap purchase: find the seller's zap endpoint, sign
 * a zap request for the listing and fetch the invoice from the seller's
 * Lightning provider. Payment goes straight to the seller.
 */

import { NDKEvent } from '@nostr-dev-kit/ndk';
import { decode } from 'light-bolt11-decoder';
import { ndk } from '$lib/ndk';
import { RELAY_URLS } from '$lib/config';
import { KIND_IMAGE_LISTING, type GalleryImage } from './events';
import { fetchZapEndpoint, invoiceAmountMsats, profileLud16, type ZapEndpoint } from './lnurl';

const KIND_ZAP_REQUEST = 9734;
const PROFILE_TIMEOUT_MS = 6000;

/** The pubkey's zap endpoint, or null if their profile has no zap-capable lud16. */
export async function getZapEndpoint(pubkey: string): Promise<ZapEndpoint | null> {
	const profile = await Promise.race([
		ndk.fetchEvent({ kinds: [0], authors: [pubkey] }),
		new Promise<null>((resolve) => setTimeout(() => resolve(null), PROFILE_TIMEOUT_MS))
	]);
	const lud16 = profile ? profileLud16(profile.content) : null;
	return lud16 ? fetchZapEndpoint(lud16) : null;
}

/** Sign a zap request for the listing and return the seller's BOLT11 invoice. */
export async function requestZapInvoice(image: GalleryImage, endpoint: ZapEndpoint): Promise<string> {
	const amountMsats = image.priceSats * 1000;
	if (amountMsats < endpoint.minSendable || amountMsats > endpoint.maxSendable) {
		throw new Error("The seller's Lightning address can't accept this amount");
	}

	const request = new NDKEvent(ndk);
	request.kind = KIND_ZAP_REQUEST;
	request.content = `Zap Gallery: ${image.title}`;
	request.tags = [
		// The provider publishes the receipt here, where the server looks for it
		['relays', ...RELAY_URLS],
		['amount', String(amountMsats)],
		['p', image.publisherPubkey],
		['e', image.eventId],
		['a', `${KIND_IMAGE_LISTING}:${image.publisherPubkey}:${image.slug}`]
	];
	await request.sign();

	const url = new URL(endpoint.callback);
	url.searchParams.set('amount', String(amountMsats));
	url.searchParams.set('nostr', JSON.stringify(request.rawEvent()));

	const res = await fetch(url);
	const data = await res.json().catch(() => null);
	if (!res.ok || !data || data.status === 'ERROR' || typeof data.pr !== 'string') {
		throw new Error(data?.reason ?? `Lightning provider error (HTTP ${res.status})`);
	}

	// Don't pay an invoice for a different amount than the listing price
	if (invoiceAmountMsats(decode(data.pr).sections) !== amountMsats) {
		throw new Error('Invoice amount does not match the listing price');
	}
	return data.pr;
}
