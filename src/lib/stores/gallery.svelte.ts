/**
 * Gallery state: fetches and reactively updates image listings from Nostr relays.
 */

import { ndk } from '$lib/ndk';
import type { GalleryImage } from '$lib/nostr/events';
import { browser } from '$app/environment';

let images = $state<GalleryImage[]>([]);
let latestEventTimestamp = $state<number>(0);
let loaded = $state(false);
let loading = $state(false);
let currentAuthorFilter = $state<string | null>(null);

const LIMIT = 50;

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

export function getGallery() {
	return {
		get images() { return images; },
		get loaded() { return loaded; },
		get loading() { return loading; }
	};
}

/** Fetch images from all gallery publishers (home page) */
export async function fetchGalleryImages(): Promise<void> {
	loading = true;
	try {
		const filter: any = { kinds: [30024], limit: LIMIT };
		if (latestEventTimestamp > 0) {
			filter.since = latestEventTimestamp + 1;
		}
		const events = await ndk.fetchEvents(filter);
		const newImages = Array.from(events)
			.filter(ev => {
				// Only include published events (exclude deletions)
				return ev.tagValue('d') != null && ev.tagValue('title') != null && ev.tags.length > 0;
			})
			.map(parseImageEvent);

		for (const img of newImages) {
			if (img.publishedAt > latestEventTimestamp) {
				latestEventTimestamp = img.publishedAt;
			}
		}

		// Deduplicate by eventId
		const existingIds = new Set(images.map(i => i.eventId));
		const uniqueNew = newImages.filter(i => !existingIds.has(i.eventId));

		images = [...uniqueNew, ...images].sort((a, b) => b.publishedAt - a.publishedAt);
		loaded = true;
	} catch (err) {
		console.error('Failed to fetch gallery images:', err);
	} finally {
		loading = false;
	}
}

/** Fetch images from a specific seller (per-user gallery) */
export async function fetchSellerImages(pubkey: string): Promise<GalleryImage[]> {
	try {
		const events = await ndk.fetchEvents({
			kinds: [30024],
			authors: [pubkey],
			limit: LIMIT
		});

		return Array.from(events)
			.filter(ev => ev.tagValue('d') != null && ev.tagValue('title') != null)
			.map(parseImageEvent)
			.sort((a, b) => b.publishedAt - a.publishedAt);
	} catch (err) {
		console.error('Failed to fetch seller images:', err);
		return [];
	}
}

/**
 * Subscribe to real-time updates on Nostr.
 * Listens for new kind 30024 events.
 */
export function subscribeGallery(): () => void {
	const sub = ndk.subscribe(
		{ kinds: [30024] as number[], since: Math.floor(Date.now() / 1000) },
		{ closeOnEose: false }
	);

	sub.on('event', (event: any) => {
		if (event.tagValue('d') && event.tagValue('title')) {
			const img = parseImageEvent(event);
			const existingIds = new Set(images.map(i => i.eventId));
			if (!existingIds.has(img.eventId)) {
				images = [...images, img].sort((a, b) => b.publishedAt - a.publishedAt);
			}
		}
	});

	return () => sub.stop();
}

/**
 * Initialise: fetch images on page load and subscribe for live updates.
 */
if (browser) {
	fetchGalleryImages();
}
