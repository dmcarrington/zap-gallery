/**
 * Remembers purchases in the buyer's browser so they can be resumed or
 * re-downloaded after a reload. Both are only claims: the server re-checks
 * settlement with the wallet, or re-verifies the zap receipt, every time.
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

function zapKey(buyerPubkey: string, image: GalleryImage): string {
	return `zap-gallery:zap:${buyerPubkey}:${image.publisherPubkey}:${image.slug}`;
}

export function saveZapPurchase(buyerPubkey: string, image: GalleryImage): void {
	try {
		localStorage.setItem(zapKey(buyerPubkey, image), '1');
	} catch {
		// storage unavailable — purchase still works this session
	}
}

export function hasZapPurchase(buyerPubkey: string, image: GalleryImage): boolean {
	try {
		return localStorage.getItem(zapKey(buyerPubkey, image)) === '1';
	} catch {
		return false;
	}
}
