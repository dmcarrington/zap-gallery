/**
 * Client-side upload + publish flow.
 *
 * Generates a thumbnail, uploads both thumbnail and full-resolution image
 * to Blossom using the user's signer, then signs and publishes a
 * kind 30024 listing event. Runs entirely in the browser — Vercel function
 * body limits make server-side upload of 20 MB images impractical.
 */

import { NDKEvent } from '@nostr-dev-kit/ndk';
import type { Signer, SignedEvent } from 'blossom-client-sdk';
import { ndk } from './ndk';
import { uploadToBlossom, generateThumbnail } from './blossom';

export interface UploadInput {
	file: File;
	title: string;
	description?: string;
	priceSats: number;
	tags?: string[];
}

export interface UploadResult {
	eventId: string;
	slug: string;
	thumbnailUrl: string;
	fullResUrl: string;
	sha256: string;
}

const KIND_IMAGE_LISTING = 30024;
const SLUG_MAX = 60;
const THUMB_MAX_WIDTH = 800;

function makeSlug(title: string, sha256: string): string {
	const base = title
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-|-$/g, '')
		.substring(0, SLUG_MAX);
	// Append sha256 prefix so re-uploads with the same title don't replace
	// an earlier listing (kind 30024 is parameterised-replaceable on `d`).
	return `${base || 'image'}-${sha256.slice(0, 8)}`;
}

/** Wrap the active NDK signer as a blossom-client-sdk Signer. */
function ndkBlossomSigner(): Signer {
	return async (draft) => {
		if (!ndk.signer) throw new Error('Not signed in');
		const event = new NDKEvent(ndk);
		event.kind = (draft as { kind: number }).kind;
		event.content = (draft as { content: string }).content;
		event.tags = (draft as { tags: string[][] }).tags;
		event.created_at = (draft as { created_at: number }).created_at;
		await event.sign(ndk.signer);
		return {
			id: event.id,
			kind: event.kind,
			content: event.content,
			tags: event.tags,
			created_at: event.created_at!,
			pubkey: event.pubkey,
			sig: event.sig!
		} as unknown as SignedEvent;
	};
}

export async function uploadAndPublish(input: UploadInput): Promise<UploadResult> {
	if (!ndk.signer) throw new Error('Not signed in');

	const signer = ndkBlossomSigner();

	// 1. Generate + upload thumbnail
	const thumbBlob = await generateThumbnail(input.file, THUMB_MAX_WIDTH);
	const thumb = await uploadToBlossom(thumbBlob, signer);

	// 2. Upload full-resolution
	const full = await uploadToBlossom(input.file, signer);

	// 3. Build & publish listing
	const slug = makeSlug(input.title, full.sha256);
	const event = new NDKEvent(ndk);
	event.kind = KIND_IMAGE_LISTING;
	event.content = input.description ?? '';
	event.tags = [
		['d', slug],
		['title', input.title],
		['price', String(input.priceSats)],
		['currency', 'sats'],
		['thumb', thumb.url],
		['full_res_url', full.url],
		['image', full.sha256],
		['m', input.file.type],
		['size', String(input.file.size)],
		['published_at', String(Math.floor(Date.now() / 1000))]
	];
	for (const t of input.tags ?? []) event.tags.push(['t', t]);

	await event.sign();
	await event.publish();

	return {
		eventId: event.id,
		slug,
		thumbnailUrl: thumb.url,
		fullResUrl: full.url,
		sha256: full.sha256
	};
}

/** Count an author's existing kind 30024 listings (for free-tier limit). */
export async function countUserListings(pubkey: string): Promise<number> {
	const events = await ndk.fetchEvents({
		kinds: [KIND_IMAGE_LISTING] as number[],
		authors: [pubkey],
		limit: 100
	});
	return events.size;
}
