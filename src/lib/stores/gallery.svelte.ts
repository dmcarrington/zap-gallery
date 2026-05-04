/**
 * Gallery state: subscribes to image listings from Nostr relays.
 *
 * Uses NDK subscriptions (not fetchEvents) because broad queries —
 * `{ kinds: [30024] }` with no author filter — don't reliably get an
 * EOSE from every relay, which would cause fetchEvents to hang forever.
 * The subscription pattern flips `loading=false` on the first EOSE and
 * has a hard timeout fallback so the UI never gets stuck on the skeleton.
 */

import { ndk } from '$lib/ndk';
import type { GalleryImage } from '$lib/nostr/events';

let images = $state<GalleryImage[]>([]);
let loaded = $state(false);
let loading = $state(false);

const LIMIT = 50;
const LOAD_TIMEOUT_MS = 5000;

// kind 30024 is not a NIP-reserved kind; other apps publish unrelated
// events under the same kind. This app stores a Blossom sha256 (64 hex
// chars) in the `image` tag; other apps typically store a URL there.
// Using that shape as a "this is one of ours" filter avoids us trying
// to render foreign events with incompatible schemas.
const SHA256_HEX = /^[0-9a-f]{64}$/i;
function isGalleryListing(ev: any): boolean {
	const image = ev.tagValue('image');
	return (
		ev.tagValue('d') != null &&
		ev.tagValue('title') != null &&
		typeof image === 'string' &&
		SHA256_HEX.test(image)
	);
}

function parseImageEvent(ev: any): GalleryImage {
	return {
		eventId: ev.id,
		title: ev.tagValue('title') || 'Untitled',
		description: ev.content || '',
		priceSats: Number(ev.tagValue('price') || 0),
		slug: ev.tagValue('d') || '',
		sha256: ev.tagValue('image') || undefined,
		mimeType: ev.tagValue('m') || undefined,
		size: Number(ev.tagValue('size') || 0),
		publisherPubkey: ev.pubkey,
		publishedAt: Number(ev.tagValue('published_at') || 0),
		tags: ev.getMatchingTags('t').map((t: string[]) => t[1])
	};
}

function addImage(img: GalleryImage) {
	if (images.some(i => i.eventId === img.eventId)) return;
	images = [...images, img].sort((a, b) => b.publishedAt - a.publishedAt);
}

export function getGallery() {
	return {
		get images() { return images; },
		get loaded() { return loaded; },
		get loading() { return loading; }
	};
}

/** Fetch images from a specific seller (per-user gallery) */
export async function fetchSellerImages(pubkey: string): Promise<GalleryImage[]> {
	try {
		const events = await ndk.fetchEvents({
			kinds: [30024] as any,
			authors: [pubkey],
			limit: LIMIT
		});

		return Array.from(events)
			.filter(isGalleryListing)
			.map(parseImageEvent)
			.sort((a, b) => b.publishedAt - a.publishedAt);
	} catch (err) {
		console.error('Failed to fetch seller images:', err);
		return [];
	}
}

/**
 * Subscribe to kind 30024 events. Populates `images` as events arrive,
 * flips `loaded=true` on EOSE (or after LOAD_TIMEOUT_MS as a safety net).
 * Stays open for live updates.
 */
export function subscribeGallery(): () => void {
	loading = true;
	loaded = false;

	const sub = ndk.subscribe(
		{ kinds: [30024] as any, limit: LIMIT },
		{ closeOnEose: false }
	);

	sub.on('event', (event: any) => {
		if (isGalleryListing(event)) {
			addImage(parseImageEvent(event));
		}
	});

	const finishLoading = () => {
		if (loaded) return;
		loaded = true;
		loading = false;
	};

	sub.on('eose', finishLoading);
	const timeout = setTimeout(finishLoading, LOAD_TIMEOUT_MS);

	return () => {
		clearTimeout(timeout);
		sub.stop();
	};
}
