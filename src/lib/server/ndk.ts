/**
 * Server-side NDK instance with the gallery owner's private key signer.
 * Only importable from +server.ts / +page.server.ts files.
 */
import NDK, { NDKPrivateKeySigner } from '@nostr-dev-kit/ndk';
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
	await serverNdk.connect();

	return { ndk: serverNdk, signer: serverSigner };
}
