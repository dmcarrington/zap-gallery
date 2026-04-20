import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getPublicKey, verifyEvent } from 'nostr-tools';

export const POST: RequestHandler = async ({ request }) => {
	const body = await request.json();
	const pubkey: string | undefined = body.pubkey;
	const sig: string | undefined = body.sig;
	const challenge: string | undefined = body.challenge;

	if (!pubkey || !sig || !challenge) {
		return error(400, 'Missing required fields: pubkey, sig, challenge');
	}

	// Verify the signature
	const challengeMessage = `zap-gallery-pro: authenticate ${pubkey}`;

	if (challenge !== challengeMessage) {
		return error(400, 'Invalid challenge');
	}

	try {
		// Reconstruct the event and verify
		const signedEvent = {
			id: '', // We don't have the ID, just use empty string for verification
			pubkey,
			sig,
			content: challenge,
			tags: [],
			kind: 27235,
			created_at: Math.floor(Date.now() / 1000)
		};

		const isValid = verifyEvent(signedEvent);
		if (!isValid) {
			return error(401, 'Invalid signature');
		}

		// Signature is valid
		return json({
			valid: true,
			pubkey,
			pro: true
		});
	} catch (err) {
		console.error('[api/auth/pro] verify failed:', err);
		return error(500, 'Failed to verify signature');
	}
};
