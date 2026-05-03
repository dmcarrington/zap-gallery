import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getServerNdk } from '$lib/server/ndk';
import { GALLERY_OWNER_PUBKEY } from '$lib/config';
import { KIND_APP_DATA } from '$lib/nostr/events';
import { storeInvoice, getInvoice, markPaid, hasPaidInvoice } from '$lib/server/payments';
import { hasValidZap } from '$lib/nostr/zaps';
import NDK, { NDKEvent, NDKUser } from '@nostr-dev-kit/ndk';
import { NDKNip04Encryptor } from '@nostr-dev-kit/ndk';
import { env } from '$env/dynamic/private';

export const GET: RequestHandler = async ({ params, url }) => {
	const slug = params.slug;
	const pubkey = url.searchParams.get('pubkey');
	const invoice = url.searchParams.get('invoice');
	const amountMsat = parseInt(url.searchParams.get('amount_msat') || '0', 10);
	const imageEventId = url.searchParams.get('image_event');
	const imageSlug = url.searchParams.get('image_slug');

	if (!slug) return error(400, 'Missing slug parameter');
	if (!pubkey) return error(400, 'Missing pubkey parameter');

	// 1. Verify payment
	let paymentVerified = false;

	if (invoice && amountMsat > 0) {
		paymentVerified = hasPaidInvoice(invoice);
	} else if (imageEventId && imageSlug) {
		paymentVerified = await hasValidZap(pubkey, imageEventId);
	}

	if (!paymentVerified) {
		return error(402, 'Payment not yet confirmed. Please complete the zap first.');
	}

	// 2. Mark invoice as paid (for analytics / download tracking)
	if (invoice) {
		markPaid(invoice);
	}

	// 3. Retrieve the stored full-res URL from kind 30078
	let serverNdk;
	try {
		serverNdk = await getServerNdk();
	} catch {
		return error(500, 'Server signing not configured');
	}

	const { ndk, signer } = serverNdk;

	const urlEvents = await Promise.race([
		ndk.fetchEvents({
			kinds: [KIND_APP_DATA as number],
			authors: [GALLERY_OWNER_PUBKEY],
			'#d': [`zap-gallery-url:${slug}`]
		}),
		new Promise<Set<NDKEvent>>((resolve) => setTimeout(() => resolve(new Set()), 8000))
	]);

	const urlEvent = Array.from(urlEvents)[0];
	if (!urlEvent) {
		return error(404, 'Image URL not found');
	}

	const ownerUser = new NDKUser({ pubkey: GALLERY_OWNER_PUBKEY });
	ownerUser.ndk = ndk;

	let urlData: { url: string; slug: string; mimeType: string };
	try {
		const decrypted = await signer.decrypt(ownerUser, urlEvent.content, 'nip04');
		urlData = JSON.parse(decrypted);
	} catch {
		return error(500, 'Failed to decrypt image URL');
	}

	if (!urlData.url) {
		return error(500, 'Invalid URL data in event');
	}

	// 4. Return the download URL
	return json({
		url: urlData.url,
		slug: urlData.slug,
		mimeType: urlData.mimeType || 'image/jpeg'
	});
};
