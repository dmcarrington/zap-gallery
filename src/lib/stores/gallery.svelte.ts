/**
 * Gallery state: fetches and reactively updates image listings from Nostr relays.
 */

import { ndk } from '$lib/ndk';
import { GALLERY_OWNER_PUBKEY } from '$lib/config';
import { KIND_IMAGE_LISTING, parseImageEvent, type GalleryImage } from '$lib/nostr/events';
import type { NDKEvent } from '@nostr-dev-kit/ndk';

let images = $state<GalleryImage[]>([]);
let loading = $state(true);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let subscription: any = null;

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
	const imageMap = new Map<string, GalleryImage>();

	subscription = ndk.subscribe(
		{
			kinds: [KIND_IMAGE_LISTING as number],
			authors: [GALLERY_OWNER_PUBKEY]
		},
		{ closeOnEose: false }
	);

	subscription.on('event', (event: NDKEvent) => {
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
