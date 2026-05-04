/**
 * Nostr event kind constants and helpers for gallery data.
 */

import type { NDKEvent } from '@nostr-dev-kit/ndk';

// Event kinds
export const KIND_GALLERY_META = 30023; // Parameterized replaceable: gallery metadata
export const KIND_IMAGE_LISTING = 30024; // Parameterized replaceable: per-image listing
export const KIND_APP_DATA = 30078; // Application-specific data
export const KIND_ZAP_RECEIPT = 9735; // Zap receipt (standard)
export const KIND_SEALED_DM = 14; // NIP-17 sealed DM

export interface GalleryImage {
	eventId: string;
	slug: string; // d-tag
	publisherPubkey: string;
	title: string;
	description: string;
	priceSats: number;
	thumbnailUrl: string; // Blossom URL (public)
	fullResUrl: string; // Blossom URL of full-res
	imageHash?: string; // sha256 of the full-res blob, if recorded
	mimeType: string;
	size: number;
	createdAt: number;
	tags: string[]; // user-supplied content tags (kind 30024 `t` tags)
}

export function parseImageEvent(event: NDKEvent): GalleryImage | null {
	const slug = getTagValue(event, 'd');
	const title = getTagValue(event, 'title') ?? 'Untitled';
	const thumbnailUrl = getTagValue(event, 'thumb') ?? '';

	// A listing without a slug or a thumbnail is not renderable.
	if (!slug || !thumbnailUrl) return null;

	return {
		eventId: event.id,
		slug,
		publisherPubkey: event.pubkey,
		title,
		description: event.content ?? '',
		priceSats: parseInt(getTagValue(event, 'price') ?? '0', 10),
		thumbnailUrl,
		fullResUrl: getTagValue(event, 'full_res_url') ?? '',
		imageHash: getTagValue(event, 'image'),
		mimeType: getTagValue(event, 'm') ?? 'image/jpeg',
		size: parseInt(getTagValue(event, 'size') ?? '0', 10),
		createdAt: event.created_at ?? 0,
		tags: event.getMatchingTags('t').map((t) => t[1])
	};
}

function getTagValue(event: NDKEvent, tagName: string): string | undefined {
	const tag = event.tags.find(([t]) => t === tagName);
	return tag?.[1];
}
