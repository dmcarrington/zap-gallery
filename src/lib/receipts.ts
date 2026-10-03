/**
 * Remembers invoice tokens in the buyer's browser so a purchase can be
 * resumed or re-downloaded after a reload. The token is only a claim — the
 * server re-checks settlement with the wallet every time it is presented.
 */

import type { GalleryImage } from '$lib/nostr/events';

function storageKey(buyerPubkey: string, image: GalleryImage): string {
	return `zap-gallery:invoice:${buyerPubkey}:${image.publisherPubkey}:${image.slug}`;
}

export function saveInvoiceToken(buyerPubkey: string, image: GalleryImage, token: string): void {
	try {
		localStorage.setItem(storageKey(buyerPubkey, image), token);
	} catch {
		// storage unavailable (private window, blocked site data) — purchase still works this session
	}
}

export function loadInvoiceToken(buyerPubkey: string, image: GalleryImage): string | null {
	try {
		return localStorage.getItem(storageKey(buyerPubkey, image));
	} catch {
		return null;
	}
}
