/**
 * Kind 0 profile lookup for showing names and avatars instead of npubs.
 */

import { ndk } from '$lib/ndk';

export interface Profile {
	name?: string;
	picture?: string;
}

const PROFILE_TIMEOUT_MS = 6000;

/** Fetch a pubkey's display name and avatar; empty if none is found in time. */
export async function fetchProfile(pubkey: string): Promise<Profile> {
	const event = await Promise.race([
		ndk.fetchEvent({ kinds: [0], authors: [pubkey] }),
		new Promise<null>((resolve) => setTimeout(() => resolve(null), PROFILE_TIMEOUT_MS))
	]);
	if (!event) return {};

	try {
		const data = JSON.parse(event.content);
		const name = [data.display_name, data.displayName, data.name].find(
			(v) => typeof v === 'string' && v.trim()
		);
		const picture =
			typeof data.picture === 'string' && /^https?:\/\//.test(data.picture) ? data.picture : undefined;
		return { name: name?.trim(), picture };
	} catch {
		return {};
	}
}
