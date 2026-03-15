/**
 * Gallery state: fetches and reactively updates image listings from Nostr relays.
 */

import { ndk } from '$lib/ndk';
import { GALLERY_OWNER_PUBKEY } from '$lib/config';
import { KIND_IMAGE_LISTING, parseImageEvent, type GalleryImage } from '$lib/nostr/events';
import { NDKEvent, type NDKEvent as NDKEventType } from '@nostr-dev-kit/ndk';

let images = $state<GalleryImage[]>([]);
let loading = $state(true);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let subscription: any = null;
const imageMap = new Map<string, GalleryImage>();

export function getGallery() {
	return {
		get images() {
			return images;
		},
		get loading() {
			return loading;
		}
	};
}

export function subscribeToGallery() {
	if (subscription || !GALLERY_OWNER_PUBKEY) return;

	loading = true;
	imageMap.clear();

	subscription = ndk.subscribe(
		{
			kinds: [KIND_IMAGE_LISTING as number],
			authors: [GALLERY_OWNER_PUBKEY]
		},
		{ closeOnEose: false }
	);

	subscription.on('event', (event: NDKEventType) => {
		const image = parseImageEvent(event);
		if (image) {
			imageMap.set(image.slug, image);
			images = Array.from(imageMap.values()).sort((a, b) => b.createdAt - a.createdAt);
		}
	});

	subscription.on('eose', () => {
		loading = false;
	});
}

export function unsubscribeFromGallery() {
	if (subscription) {
		subscription.stop();
		subscription = null;
	}
}

export function getImageBySlug(slug: string): GalleryImage | undefined {
	return images.find((img) => img.slug === slug);
}

/**
 * Delete an image from the gallery by publishing a NIP-09 deletion event (kind 5).
 * This removes the kind 30024 listing from relays but does NOT delete the
 * full-resolution file from Blossom, so existing buyers can still re-download.
 */
export async function deleteImage(image: GalleryImage): Promise<void> {
	const deleteEvent = new NDKEvent(ndk);
	deleteEvent.kind = 5;
	deleteEvent.content = 'Image removed from gallery';
	deleteEvent.tags = [
		['e', image.eventId],
		['a', `${KIND_IMAGE_LISTING}:${GALLERY_OWNER_PUBKEY}:${image.slug}`]
	];

	await deleteEvent.publish();

	// Remove from local state
	imageMap.delete(image.slug);
	images = Array.from(imageMap.values()).sort((a, b) => b.createdAt - a.createdAt);
}
