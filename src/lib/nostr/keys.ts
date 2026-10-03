/**
 * Image secret storage for zap-gated images.
 *
 * Lifecycle:
 * 1. Seller encrypts the full-res image (AES-256-GCM) and uploads the ciphertext to Blossom
 * 2. The AES key + ciphertext URL are stored in a kind 30078 event signed by the seller,
 *    NIP-04 encrypted to the gallery owner's pubkey (the key the server signs with)
 * 3. Buyer pays → calls /api/download/[slug], which verifies payment
 * 4. Server decrypts the secret and returns it; the buyer's browser decrypts the image
 *
 * The seller can also decrypt their own secret (NIP-04 shared secret is symmetric).
 */

import { NDKEvent, NDKUser } from '@nostr-dev-kit/ndk';
import { ndk } from '$lib/ndk';
import { GALLERY_OWNER_PUBKEY } from '$lib/config';
import { KIND_APP_DATA } from './events';

export interface ImageSecret {
	slug: string; // image slug for identification
	url: string; // Blossom URL of the encrypted full-res blob
	key?: string; // base64 AES-256 key; absent on legacy unencrypted uploads
	mimeType: string; // type of the decrypted image
}

export function imageSecretDTag(slug: string): string {
	return `zap-gallery-key:${slug}`;
}

function ownerUser(): NDKUser {
	if (!GALLERY_OWNER_PUBKEY) throw new Error('PUBLIC_GALLERY_OWNER_PUBKEY is not configured');
	const user = new NDKUser({ pubkey: GALLERY_OWNER_PUBKEY });
	user.ndk = ndk;
	return user;
}

/**
 * Publish the secret for an image as a kind 30078 event signed by the
 * current user, readable only by them and the gallery owner.
 */
export async function storeImageSecret(secret: ImageSecret): Promise<void> {
	if (!ndk.signer) throw new Error('Signer required');

	const encrypted = await ndk.signer.encrypt(ownerUser(), JSON.stringify(secret), 'nip04');

	const event = new NDKEvent(ndk);
	event.kind = KIND_APP_DATA;
	event.content = encrypted;
	event.tags = [
		['d', imageSecretDTag(secret.slug)],
		['L', 'zap-gallery'],
		['l', 'image-key', 'zap-gallery']
	];

	await event.publish();
}

/**
 * Retrieve the secret for one of the logged-in seller's own images.
 */
export async function retrieveOwnImageSecret(
	slug: string,
	sellerPubkey: string
): Promise<ImageSecret | null> {
	if (!ndk.signer) return null;

	const event = await ndk.fetchEvent({
		kinds: [KIND_APP_DATA as number],
		authors: [sellerPubkey],
		'#d': [imageSecretDTag(slug)]
	});
	if (!event) return null;

	try {
		const decrypted = await ndk.signer.decrypt(ownerUser(), event.content, 'nip04');
		return JSON.parse(decrypted) as ImageSecret;
	} catch {
		return null;
	}
}
