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

// kind 30024 is not a NIP-reserved kind; other apps use it too. Every
// listing this app publishes carries an `app_data` tag pointing at the
// matching kind 30078 record, so we use that as the "this is one of ours"
// marker to filter out foreign events with incompatible tag schemas.
function isGalleryListing(ev: any): boolean {
	return (
		ev.tagValue('d') != null &&
		ev.tagValue('title') != null &&
		ev.tagValue('app_data') != null
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
