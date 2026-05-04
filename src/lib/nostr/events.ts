/**
 * Nostr event kind constants and helpers for gallery data.
 */

// Event kinds
export const KIND_GALLERY_META = 30023; // Parameterized replaceable: gallery metadata
export const KIND_IMAGE_LISTING = 30024; // Parameterized replaceable: per-image listing
export const KIND_APP_DATA = 30078; // Application-specific data: stored image URLs
export const KIND_ZAP_RECEIPT = 9735; // Zap receipt (standard)
export const KIND_SEALED_DM = 14; // NIP-17 sealed DM

export interface GalleryImage {
	eventId: string;
	slug: string; // d-tag
	title: string;
	description: string;
	priceSats: number;
	sha256?: string; // Blossom content hash; public URL is `${BLOSSOM_SERVERS[0]}/${sha256}`
	mimeType?: string;
	size: number;
	publisherPubkey: string;
	publishedAt: number;
	tags: string[];
}
