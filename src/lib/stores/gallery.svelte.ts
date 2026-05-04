/**
 * Gallery store: shows kind 30024 listings from authorised sellers.
 *
 * The set of authorised sellers is read from the on-chain seller registry
 * (kind 30078, owner-signed, d='zap-gallery-sellers'). The gallery owner
 * is always included implicitly. Querying with a narrow `authors` filter
 * avoids the broad-query reliability problems we hit when subscribing to
 * `{kinds:[30024]}` with no author filter (other apps, hung subscriptions,
 * 404 thumbnails from foreign Blossom servers).
 */

import { ndk } from '$lib/ndk';
import { GALLERY_OWNER_PUBKEY } from '$lib/config';
import { KIND_IMAGE_LISTING, parseImageEvent, type GalleryImage } from '$lib/nostr/events';
import {
	NDKEvent,
	type NDKEvent as NDKEventType,
	type NDKSubscription
} from '@nostr-dev-kit/ndk';

const REGISTRY_KIND = 30078;
const REGISTRY_DTAG = 'zap-gallery-sellers';
const LOAD_TIMEOUT_MS = 5000;

let images = $state<GalleryImage[]>([]);
let loading = $state(false);
let loaded = $state(false);

let subscription: NDKSubscription | null = null;
let loadTimer: ReturnType<typeof setTimeout> | null = null;
const imageMap = new Map<string, GalleryImage>(); // keyed by eventId

export function getGallery() {
	return {
		get images() {
			return images;
		},
		get loading() {
			return loading;
		},
		get loaded() {
			return loaded;
		}
	};
}

/** Fetch the seller registry and return active seller pubkeys (owner included). */
async function fetchActiveSellers(): Promise<string[]> {
	const sellers = new Set<string>();
	if (GALLERY_OWNER_PUBKEY) sellers.add(GALLERY_OWNER_PUBKEY);

	if (!GALLERY_OWNER_PUBKEY) return [...sellers];

	try {
		const event = await ndk.fetchEvent({
			kinds: [REGISTRY_KIND] as number[],
			authors: [GALLERY_OWNER_PUBKEY],
			'#d': [REGISTRY_DTAG]
		});

		if (event) {
			const doc = JSON.parse(event.content);
			const now = Math.floor(Date.now() / 1000);
			if (doc?.sellers && typeof doc.sellers === 'object') {
				for (const [pubkey, entry] of Object.entries(doc.sellers as Record<string, { expiresAt?: number }>)) {
					if (entry?.expiresAt && entry.expiresAt > now) sellers.add(pubkey);
				}
			}
		}
	} catch (err) {
		console.error('[gallery] failed to fetch seller registry', err);
	}

	return [...sellers];
}

function finishLoading() {
	if (loaded) return;
	loaded = true;
	loading = false;
	if (loadTimer) {
		clearTimeout(loadTimer);
		loadTimer = null;
	}
}

export async function subscribeToGallery(): Promise<void> {
	if (subscription) return;
	loading = true;
	loaded = false;
	imageMap.clear();
	images = [];

	const authors = await fetchActiveSellers();
	if (authors.length === 0) {
		// No registered sellers and no owner pubkey — nothing to query.
		finishLoading();
		return;
	}

	subscription = ndk.subscribe(
		{
			kinds: [KIND_IMAGE_LISTING] as number[],
			authors
		},
		{ closeOnEose: false }
	);

	subscription.on('event', (event: NDKEventType) => {
		const image = parseImageEvent(event);
		if (!image) return;
		imageMap.set(image.eventId, image);
		images = Array.from(imageMap.values()).sort((a, b) => b.createdAt - a.createdAt);
	});

	subscription.on('eose', finishLoading);
	loadTimer = setTimeout(finishLoading, LOAD_TIMEOUT_MS);
}

export function unsubscribeFromGallery() {
	if (subscription) {
		subscription.stop();
		subscription = null;
	}
	if (loadTimer) {
		clearTimeout(loadTimer);
		loadTimer = null;
	}
}

export function getImageBySlug(slug: string): GalleryImage | undefined {
	return images.find((img) => img.slug === slug);
}

/**
 * Publish a NIP-09 deletion (kind 5) for a listing. Removes the kind 30024
 * record from relays; does NOT delete the Blossom file (existing buyers
 * can still re-download).
 */
export async function deleteImage(image: GalleryImage, publisherPubkey: string): Promise<void> {
	const deleteEvent = new NDKEvent(ndk);
	deleteEvent.kind = 5;
	deleteEvent.content = 'Image removed from gallery';
	deleteEvent.tags = [
		['e', image.eventId],
		['a', `${KIND_IMAGE_LISTING}:${publisherPubkey}:${image.slug}`]
	];

	await deleteEvent.publish();

	imageMap.delete(image.eventId);
	images = Array.from(imageMap.values()).sort((a, b) => b.createdAt - a.createdAt);
}
