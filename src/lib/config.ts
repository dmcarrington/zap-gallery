import { env } from '$env/dynamic/public';

export const GALLERY_OWNER_PUBKEY = env.PUBLIC_GALLERY_OWNER_PUBKEY ?? '';

export const BLOSSOM_SERVERS = (
	env.PUBLIC_BLOSSOM_SERVERS ?? 'https://blossom.nostr.build,https://blossom.band'
)
	.split(',')
	.map((url) => url.trim());

export const BLOSSOM_MAX_FILE_SIZE_MB = parseInt(env.PUBLIC_BLOSSOM_MAX_FILE_SIZE_MB ?? '20', 10);
export const BLOSSOM_MAX_FILE_SIZE_BYTES = BLOSSOM_MAX_FILE_SIZE_MB * 1024 * 1024;

export const RELAY_URLS = (
	env.PUBLIC_RELAY_URLS ?? 'wss://relay.damus.io,wss://relay.nostr.band,wss://nos.lol'
)
	.split(',')
	.map((url) => url.trim());

// Pro tier pricing & duration. Public so /pro can render the price.
export const PRO_PRICE_SATS = parseInt(env.PUBLIC_PRO_PRICE_SATS ?? '1000', 10);
export const PRO_DURATION_DAYS = parseInt(env.PUBLIC_PRO_DURATION_DAYS ?? '30', 10);

// Free-tier upload limit. Non-Pro users may publish at most this many listings.
export const FREE_UPLOAD_LIMIT = parseInt(env.PUBLIC_FREE_UPLOAD_LIMIT ?? '1', 10);
