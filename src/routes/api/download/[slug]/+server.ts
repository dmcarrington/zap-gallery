import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getServerNdk } from '$lib/server/ndk';
import { GALLERY_OWNER_PUBKEY } from '$lib/config';
import NDK, { NDKEvent, NDKUser, NDKPrivateKeySigner } from '@nostr-dev-kit/ndk';
import { hasPaidInvoice, getInvoice, markPaid } from '$lib/server/payments';
import { isNwcConfigured, lookupInvoice } from '$lib/server/nwc';

const KIND_APP_DATA = 30078;
const KIND_ENCRYPTED_DM = 4;

export const POST: RequestHandler = async ({ params, request }) => {
	const { slug } = params;
	const body = await request.json();
	const buyerPubkey: string | undefined = body.pubkey;
	const imageEventId: string | undefined = body.eventId;
	const requiredSats: number | undefined = body.priceSats;
	const paymentHash: string | undefined = body.paymentHash;

	if (!buyerPubkey || !imageEventId || !requiredSats || !slug) {
		return error(400, 'Missing required fields: pubkey, eventId, priceSats');
	}

	// 1. Check server payment records first (fast path)
	let paymentVerified = hasPaidInvoice(slug, buyerPubkey);

	// 2. If a specific paymentHash was provided, do an on-demand NWC lookup
	if (!paymentVerified && paymentHash && isNwcConfigured()) {
		const invoice = getInvoice(paymentHash);
		if (invoice && invoice.slug === slug && invoice.buyerPubkey === buyerPubkey) {
			try {
				const result = await lookupInvoice(paymentHash);
				if (result.settled_at) {
					markPaid(paymentHash);
					paymentVerified = true;
				}
			} catch (err) {
				console.warn('[api/download] NWC lookup failed:', err);
			}
		}
	}

	// 3. Legacy fallback: check zap receipts on relays
	if (!paymentVerified) {
		let serverNdk;
		try {
			serverNdk = await getServerNdk();
		} catch {
			return error(500, 'Server signing not configured');
		}

		const { ndk } = serverNdk;

		const zapReceipts = await Promise.race([
			ndk.fetchEvents({
				kinds: [9735],
				'#e': [imageEventId]
			}),
			new Promise<Set<NDKEvent>>((resolve) => setTimeout(() => resolve(new Set()), 5000))
		]);

		for (const receipt of zapReceipts) {
			const descTag = receipt.tags.find((t) => t[0] === 'description');
			if (!descTag?.[1]) continue;

			try {
				const zapRequest = JSON.parse(descTag[1]);
				const senderPubkey = zapRequest.pubkey;
				const amountTag = zapRequest.tags?.find((t: string[]) => t[0] === 'amount');
				const amountMsats = amountTag ? parseInt(amountTag[1], 10) : 0;
				const amountSats = Math.floor(amountMsats / 1000);

				if (senderPubkey === buyerPubkey && amountSats >= requiredSats) {
					paymentVerified = true;
					break;
				}
			} catch {
				continue;
			}
		}
	}

	if (!paymentVerified) {
		return error(402, 'No valid payment found. Please complete payment first.');
	}

	// 4. Retrieve the stored full-res URL from kind 30078
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

	// 5. Send DM to buyer in the background (fire and forget)
	sendDmToBuyer(ndk, signer, buyerPubkey, urlData).catch((err) => {
		console.error('[api/download] Failed to send DM:', err);
	});

	// 6. Return the URL to the buyer immediately
	return json({ url: urlData.url, mimeType: urlData.mimeType });
};

async function sendDmToBuyer(
	ndk: NDK,
	signer: NDKPrivateKeySigner,
	buyerPubkey: string,
	urlData: { url: string; slug: string; mimeType: string }
): Promise<void> {
	const buyerUser = new NDKUser({ pubkey: buyerPubkey });
	buyerUser.ndk = ndk;

	const payload = JSON.stringify({
		type: 'zap-gallery-url',
		...urlData
	});

	const encrypted = await signer.encrypt(buyerUser, payload, 'nip04');

	const event = new NDKEvent(ndk);
	event.kind = KIND_ENCRYPTED_DM;
	event.content = encrypted;
	event.tags = [['p', buyerPubkey]];

	await event.publish();
}
