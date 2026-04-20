/**
 * Owner-side helper to unlock the encrypted full-res URL for an image.
 *
 * The URL lives in a kind-30078 event, NIP-04 encrypted to the gallery
 * owner. Storing (upload) and buyer-side unlock (post-payment) both go
 * through zap-gallery-sdk's ZapImageSDK; this helper only covers the
 * owner decrypting their own listing client-side (no DM side effect).
 */

import { NDKUser } from '@nostr-dev-kit/ndk';
import { ndk } from '$lib/ndk';
import { GALLERY_OWNER_PUBKEY } from '$lib/config';
import { KIND_APP_DATA } from './events';

export interface ImageUrlData {
	url: string;
	slug: string;
	mimeType: string;
}

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
		const data = JSON.parse(decrypted) as Partial<ImageUrlData> & { url: string };
		return {
			url: data.url,
			slug,
			mimeType: data.mimeType ?? 'image/jpeg'
		};
	} catch {
		return null;
	}
}
