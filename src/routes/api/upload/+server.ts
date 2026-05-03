import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getServerNdk } from '$lib/server/ndk';
import { NDKEvent, NDKKind } from '@nostr-dev-kit/ndk';
import {
	BLOSSOM_SERVERS,
	BLOSSOM_MAX_FILE_SIZE_MB,
	GALLERY_OWNER_PUBKEY
} from '$lib/config';
import { BlossomClient, createUploadAuth } from 'blossom-client-sdk';
import { env } from '$env/dynamic/private';
import { isPro } from '$lib/server/pro';

const MAX_FILE_SIZE = BLOSSOM_MAX_FILE_SIZE_MB * 1024 * 1024;
const FREE_UPLOAD_LIMIT = 10;

/**
 * Upload an image and publish it as a Nostr gallery listing.
 *
 * POST /api/upload
 * FormData:
 *   file: File (image)
 *   title: string
 *   description: string
 *   price: number (sats)
 *   tags: string (comma-separated)
 * Headers:
 *   x-nostr-pubkey: buyer's pubkey
 *   x-nostr-event-id: auth event id (NIP-98)
 *   x-nostr-signature: auth event signature
 *
 * Returns: { sha256, url, eventId, slug }
 */
export const POST: RequestHandler = async ({ request }) => {
	// Verify NIP-98 authentication
	const pubkey = request.headers.get('x-nostr-pubkey');
	const eventId = request.headers.get('x-nostr-event-id');
	const sig = request.headers.get('x-nostr-signature');

	if (!pubkey || !eventId || !sig) {
		return error(401, 'NIP-98 authentication required');
	}

	// Reconstruct and verify the NIP-98 auth event
	try {
		// NIP-98: the event is an HTTP Auth event for this upload endpoint
		const authEvent = new NDKEvent();
		authEvent.pubkey = pubkey;
		authEvent.id = eventId;
		authEvent.sig = sig;

		if (!authEvent.verify()) {
			return error(403, 'Invalid authentication signature');
		}
	} catch (e) {
		return error(403, 'Authentication verification failed');
	}

	// Check upload eligibility
	const isProUser = isPro(pubkey);
	if (!isProUser) {
		// Count existing uploads for free tier
		const serverNdk = await getServerNdk();
		const { ndk } = serverNdk;
		const existing = await ndk.fetchEvents({
			kinds: [30024],
			authors: [pubkey]
		});

		if (existing.size >= FREE_UPLOAD_LIMIT) {
			return error(402, `Free tier limited to ${FREE_UPLOAD_LIMIT} uploads. Upgrade to Pro for unlimited.`);
		}
	}

	// Parse FormData
	const formData = await request.formData();
	const file = formData.get('file') as File | null;
	const title = formData.get('title') as string | null;
	const description = formData.get('description') as string | null;
	const price = formData.get('price') as string | null;
	const tags = formData.get('tags') as string | null;

	if (!file || !title || !price) {
		return error(400, 'file, title, and price are required');
	}

	const priceSats = parseInt(price, 10);
	if (isNaN(priceSats) || priceSats < 1) {
		return error(400, 'Price must be at least 1 sat');
	}

	if (file.size > MAX_FILE_SIZE) {
		return error(413, `File too large. Max ${BLOSSOM_MAX_FILE_SIZE_MB} MB`);
	}

	// Validate image type
	const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif'];
	if (!allowedTypes.includes(file.type)) {
		return error(400, `Invalid image type. Allowed: JPEG, PNG, WebP, GIF, AVIF`);
	}

	try {
		// 1. Upload to Blossom
		const buffer = await file.arrayBuffer();
		const uint8 = new Uint8Array(buffer);

		const blossomServer = BLOSSOM_SERVERS[0];
		const signer = (await getServerNdk()).signer;
		const auth = await createUploadAuth(
			uint8,
			signer as any,
			'Upload from Zap Gallery'
		);

		// Upload blob to Blossom
		const uploadResponse = await fetch(`${blossomServer}/upload`, {
			method: 'PUT',
			body: uint8,
			headers: { Authorization: auth }
		});

		if (!uploadResponse.ok) {
			return error(502, 'Failed to upload to Blossom');
		}

		const bloomResult = await uploadResponse.json();
		const sha256 = bloomResult.sha256;

		// 2. Build full-res Blossom URL
		const fullResUrl = `${blossomServer}/${sha256}`;

		// 3. Encrypt full-res URL with server nsec (for the download API to decrypt later)
		const encryptedUrl = await encryptUrl(fullResUrl);

		// 4. Publish kind 30078 (App Data) — encrypted URL storage
		const { ndk: publishNdk } = await getServerNdk();
		const appDataEvent = new NDKEvent(publishNdk);
		appDataEvent.kind = 30078;
		appDataEvent.content = JSON.stringify({
			url: encryptedUrl,
			mimeType: file.type,
			size: file.size,
			uploadedBy: pubkey
		});
		appDataEvent.tags = [
			['d', sha256],
			['sha256', sha256]
		];

		await appDataEvent.publish();
		const appDataEventId = appDataEvent.id;

		// 5. Generate slug from title
		const slug = title
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, '-')
			.replace(/^-|-$/g, '')
			.substring(0, 60);

		// 6. Publish kind 30024 (Image Listing) — visible listing
		const listingEvent = new NDKEvent(publishNdk);
		listingEvent.kind = 30024;
		listingEvent.content = description || '';
		listingEvent.tags = [
			['d', slug],
			['title', title],
			['price', String(priceSats)],
			['currency', 'sats'],
			['image', sha256],
			['m', file.type],
			['size', String(file.size)],
			['p', pubkey],
			['published_at', String(Math.floor(Date.now() / 1000))],
			['app_data', appDataEventId]
		];

		if (tags) {
			const tagList = tags.split(',').map(t => t.trim()).filter(Boolean);
			for (const tag of tagList) {
				listingEvent.tags.push(['t', tag]);
			}
		}

		// Add Pro marker if applicable
		if (isProUser) {
			listingEvent.tags.push(['pro', 'true']);
		}

		await listingEvent.publish();

		return json({
			sha256,
			url: fullResUrl,
			eventId: listingEvent.id,
			slug
		});
	} catch (err) {
		console.error('[api/upload] Error:', err);
		return error(500, 'Upload failed');
	}
};

/** Encrypt a URL using the server's private key (NIP-44) */
async function encryptUrl(plaintext: string): Promise<string> {
	// Simple encryption: use NDK's NIP-44 encryption with self-conversation
	// The server encrypts to itself so only it can decrypt (for the download endpoint)
	const { ndk, signer } = await getServerNdk();

	// NIP-44 encrypt: encrypt plaintext from server's pubkey to itself
	// Using nostr-tools nip44
	const { nip44 } = await import('nostr-tools');
	const serverPubkey = (await signer.user()).pubkey;
	const serverPrivkey = signer.privateKey;

	if (!serverPrivkey) throw new Error('Server nsec not configured');

	// conversationKey is derived from server→server (self-conversation)
	const conversationKey = nip44.v2.utils.getConversationKey(serverPrivkey, serverPubkey);
	const encrypted = nip44.encrypt(plaintext, conversationKey);

	return encrypted;
}
