import { env } from '$env/dynamic/public';

export const GALLERY_OWNER_PUBKEY = env.PUBLIC_GALLERY_OWNER_PUBKEY ?? '';

export const BLOSSOM_SERVERS = (
	env.PUBLIC_BLOSSOM_SERVERS ?? 'https://blossom.nostr.build,https://blossom.band'
)
	.split(',')
	.map((url) => url.trim());

export const BLOSSOM_MAX_FILE_SIZE_MB = parseInt(env.PUBLIC_BLOSSOM_MAX_FILE_SIZE_MB ?? '20', 10);
export const BLOSSOM_MAX_FILE_SIZE_BYTES = BLOSSOM_MAX_FILE_SIZE_MB * 1024 * 1024;
