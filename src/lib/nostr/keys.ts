/**
 * Full-resolution URL storage for zap-gated images.
 *
 * URL lifecycle:
 * 1. Owner uploads image → full-res URL stored in kind 30078 event (NIP-04 encrypted to owner)
 * 2. Buyer zaps the image → calls /api/download/[slug] which verifies the zap
 * 3. Server decrypts URL from kind 30078, returns it to buyer, sends DM in background
 *
 * Security model: Blossom URLs contain the file's SHA-256 hash (64 hex chars = 256 bits
 * of entropy), making them unguessable. The URL is only revealed after payment.
 */

import { NDKEvent, NDKUser } from '@nostr-dev-kit/ndk';
import { ndk } from '$lib/ndk';
import { GALLERY_OWNER_PUBKEY } from '$lib/config';
import { KIND_APP_DATA } from './events';

export interface ImageUrlData {
	url: string; // full-res Blossom URL
	slug: string; // image slug for identification
	mimeType: string;
}

/**
 * Store the full-res URL for an image as a kind 30078 event.
 * Content is NIP-04 encrypted to the gallery owner's pubkey.
 * Only the owner can decrypt and retrieve the URL later.
 */
export async function storeImageUrl(urlData: ImageUrlData): Promise<void> {
	if (!ndk.signer) throw new Error('Signer required');

	const ownerUser = new NDKUser({ pubkey: GALLERY_OWNER_PUBKEY });
	ownerUser.ndk = ndk;

	const payload = JSON.stringify(urlData);
	const encrypted = await ndk.signer.encrypt(ownerUser, payload, 'nip04');

	const event = new NDKEvent(ndk);
	event.kind = KIND_APP_DATA;
	event.content = encrypted;
	event.tags = [
		['d', `zap-gallery-url:${urlData.slug}`],
		['L', 'zap-gallery'],
		['l', 'image-url', 'zap-gallery']
	];

	await event.publish();
}

/**
 * Retrieve the full-res URL for an image from the owner's kind 30078 event.
 * Only works when logged in as the gallery owner (client-side).
 */
export async function retrieveImageUrl(slug: string): Promise<ImageUrlData | null> {
	if (!ndk.signer) return null;

	const events = await ndk.fetchEvents({
		kinds: [KIND_APP_DATA as number],
		authors: [GALLERY_OWNER_PUBKEY],
		'#d': [`zap-gallery-url:${slug}`]
	});

	const event = Array.from(events)[0];
	if (!event) return null;

	try {
		const ownerUser = new NDKUser({ pubkey: GALLERY_OWNER_PUBKEY });
		ownerUser.ndk = ndk;
		const decrypted = await ndk.signer.decrypt(ownerUser, event.content, 'nip04');
		return JSON.parse(decrypted) as ImageUrlData;
	} catch {
		return null;
	}
}
