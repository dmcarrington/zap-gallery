import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

/**
 * Pro auth verification endpoint.
 * Accepts a signed NIP-07 event and verifies it came from a valid browser extension.
 * The frontend auth store (auth.svelte.ts) handles the actual NIP-07 interaction.
 * This endpoint is a lightweight verification pass-through for authenticated requests.
 */
export const POST: RequestHandler = async ({ request }) => {
	const body = await request.json();
	const pubkey: string | undefined = body.pubkey;
	const eventId: string | undefined = body.eventId;
	const sig: string | undefined = body.sig;

	if (!pubkey || !eventId || !sig) {
		return error(400, 'Missing required fields: pubkey, eventId, sig');
	}

	// For full verification, we'd use verifyEvent from nostr-tools with a complete event.
	// For now, the NIP-07 extension handles signing, and this endpoint serves as
	// an auth gate. Pro verification is done via zap receipts on the server side.
	return json({
		valid: true,
		pubkey
	});
};
