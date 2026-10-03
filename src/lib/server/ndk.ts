/**
 * Server-side NDK instance with the gallery owner's private key signer.
 * Only importable from +server.ts / +page.server.ts files.
 */
import NDK, { NDKPrivateKeySigner, type NDKEvent, type NDKFilter } from '@nostr-dev-kit/ndk';
import { env } from '$env/dynamic/private';
import { env as publicEnv } from '$env/dynamic/public';

const relayUrls = (
	publicEnv.PUBLIC_RELAY_URLS ?? 'wss://relay.damus.io,wss://relay.nostr.band,wss://nos.lol'
)
	.split(',')
	.map((url: string) => url.trim());

const nsec = env.GALLERY_OWNER_NSEC;
if (!nsec) {
	console.warn('[server/ndk] GALLERY_OWNER_NSEC not set — download API will not work');
}

let serverNdk: NDK | null = null;
let serverSigner: NDKPrivateKeySigner | null = null;

export async function getServerNdk(): Promise<{ ndk: NDK; signer: NDKPrivateKeySigner }> {
	if (serverNdk && serverSigner) return { ndk: serverNdk, signer: serverSigner };

	if (!nsec) throw new Error('GALLERY_OWNER_NSEC not configured');

	serverSigner = new NDKPrivateKeySigner(nsec);
	serverNdk = new NDK({
		explicitRelayUrls: relayUrls,
		signer: serverSigner
	});
	// Without a timeout connect() waits for every relay, so one dead relay hangs every request
	await serverNdk.connect(5000);

	return { ndk: serverNdk, signer: serverSigner };
}

/**
 * fetchEvents with a hard timeout. NDK waits for EOSE from a majority of
 * relays, so one slow relay can otherwise stall a request indefinitely.
 */
export async function fetchEventsWithTimeout(
	ndk: NDK,
	filter: NDKFilter,
	timeoutMs: number
): Promise<NDKEvent[]> {
	const events = await Promise.race([
		ndk.fetchEvents(filter),
		new Promise<Set<NDKEvent>>((resolve) => setTimeout(() => resolve(new Set()), timeoutMs))
	]);
	return Array.from(events);
}
