import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getServerNdk } from '$lib/server/ndk';

export const POST: RequestHandler = async ({ request }) => {
	const body = await request.json();
	const pubkey: string | undefined = body.pubkey;
	const imageEventId: string | undefined = body.imageEventId;
	const requiredSats: number | undefined = body.priceSats;

	if (!pubkey || !imageEventId || !requiredSats) {
		return error(400, 'Missing required fields: pubkey, imageEventId, priceSats');
	}

	let serverNdk;
	try {
		serverNdk = await getServerNdk();
	} catch {
		return error(500, 'Server signing not configured');
	}

	const { ndk } = serverNdk;

	// Query Zap Receipts (kind 9735) from relays
	const zapReceipts = await ndk.fetchEvents(
		{
			kinds: [9735],
			'#e': [imageEventId]
		}
	);

	let maxAmountSats = 0;
	let foundPayment = false;

	for (const receipt of zapReceipts) {
		const descTag = receipt.tags.find((t) => t[0] === 'description');
		if (!descTag?.[1]) continue;

		try {
			const zapRequest = JSON.parse(descTag[1]);
			const senderPubkey = zapRequest.pubkey;

			// Check if this is from our buyer
			if (senderPubkey !== pubkey) continue;

			const amountTag = zapRequest.tags?.find((t: string[]) => t[0] === 'amount');
			const amountMsats = amountTag ? parseInt(amountTag[1], 10) : 0;
			const amountSats = Math.floor(amountMsats / 1000);

			if (amountSats >= requiredSats) {
				foundPayment = true;
				maxAmountSats = Math.max(maxAmountSats, amountSats);
				break;
			}

			maxAmountSats = Math.max(maxAmountSats, amountSats);
		} catch {
			continue;
		}
	}

	if (foundPayment) {
		return json({
			verified: true,
			amountSats: maxAmountSats
		});
	}

	return json({
		verified: false,
		amountSats: maxAmountSats,
		minRequiredSats: requiredSats
	});
};
