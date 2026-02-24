import NDKSvelte from '@nostr-dev-kit/ndk-svelte';
import { browser } from '$app/environment';
import { env } from '$env/dynamic/public';

const relayUrls = (env.PUBLIC_RELAY_URLS ?? 'wss://relay.damus.io,wss://relay.nostr.band,wss://nos.lol')
	.split(',')
	.map((url) => url.trim());

export const ndk = new NDKSvelte({
	explicitRelayUrls: relayUrls
});

if (browser) {
	ndk.connect();
}
