/**
 * Nostr event kind constants and helpers for gallery data.
 */

import type { NDKEvent } from '@nostr-dev-kit/ndk';

// Event kinds
export const KIND_GALLERY_META = 30023; // Parameterized replaceable: gallery metadata
export const KIND_IMAGE_LISTING = 30024; // Parameterized replaceable: per-image listing
export const KIND_APP_DATA = 30078; // Application-specific data: stored image URLs
export const KIND_ZAP_RECEIPT = 9735; // Zap receipt (standard)
export const KIND_SEALED_DM = 14; // NIP-17 sealed DM

export interface GalleryImage {
	slug: string; // d-tag
	title: string;
	description: string;
	priceSats: number;
	thumbnailUrl: string; // Blossom URL (public)
	fullResUrl: string; // Blossom URL of full-res (kept secret, delivered via DM after payment)
	mimeType: string;
	createdAt: number;
	eventId: string;
}

export function parseImageEvent(event: NDKEvent): GalleryImage | null {
	const slug = getTagValue(event, 'd');
	const title = getTagValue(event, 'title') ?? 'Untitled';
	const description = event.content ?? '';
	const priceSats = parseInt(getTagValue(event, 'price') ?? '0', 10);
	const thumbnailUrl = getTagValue(event, 'thumb') ?? '';
	const fullResUrl = getTagValue(event, 'full_res_url') ?? '';
	const mimeType = getTagValue(event, 'm') ?? 'image/jpeg';

	if (!slug || !thumbnailUrl) return null;

	return {
		slug,
		title,
		description,
		priceSats,
		thumbnailUrl,
		fullResUrl,
		mimeType,
		createdAt: event.created_at ?? 0,
		eventId: event.id
	};
}

function getTagValue(event: NDKEvent, tagName: string): string | undefined {
	const tag = event.tags.find(([t]) => t === tagName);
	return tag?.[1];
}
