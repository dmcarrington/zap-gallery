/**
 * Seller registry persisted on Nostr as a parameterised replaceable
 * kind 30078 event (`d`-tag = `zap-gallery-sellers`) signed by the gallery
 * owner. Survives deploys because the canonical state lives on relays.
 *
 * Format:
 *   kind: 30078
 *   pubkey: GALLERY_OWNER_PUBKEY
 *   tags: [['d', 'zap-gallery-sellers']]
 *   content: JSON.stringify({ sellers: { <hexpubkey>: { addedAt, expiresAt } } })
 *
 * The gallery owner is always implicitly an active seller — they don't need
 * an entry in the registry. Other authors must have an unexpired entry.
 */

import { NDKEvent } from '@nostr-dev-kit/ndk';
import { getServerNdk } from './ndk';
import { GALLERY_OWNER_PUBKEY } from '$lib/config';

export const SELLER_REGISTRY_KIND = 30078;
export const SELLER_REGISTRY_DTAG = 'zap-gallery-sellers';

export interface SellerEntry {
	addedAt: number;
	expiresAt: number;
}

export interface RegistryDoc {
	sellers: Record<string, SellerEntry>;
}

const EMPTY_DOC: RegistryDoc = { sellers: {} };

function parseDoc(content: string): RegistryDoc {
	try {
		const parsed = JSON.parse(content);
		if (parsed && typeof parsed === 'object' && parsed.sellers && typeof parsed.sellers === 'object') {
			return parsed as RegistryDoc;
		}
	} catch {
		// fall through
	}
	return { sellers: {} };
}

/** Fetch the latest registry from relays. Returns an empty doc if none exists yet. */
export async function fetchRegistry(): Promise<RegistryDoc> {
	if (!GALLERY_OWNER_PUBKEY) return { ...EMPTY_DOC };

	const { ndk } = await getServerNdk();
	const event = await ndk.fetchEvent({
		kinds: [SELLER_REGISTRY_KIND] as number[],
		authors: [GALLERY_OWNER_PUBKEY],
		'#d': [SELLER_REGISTRY_DTAG]
	});

	if (!event) return { ...EMPTY_DOC };
	return parseDoc(event.content);
}

/** Sign and publish a new registry doc. Older versions are replaced by relays via NIP-33. */
export async function publishRegistry(doc: RegistryDoc): Promise<void> {
	const { ndk, signer } = await getServerNdk();

	const event = new NDKEvent(ndk);
	event.kind = SELLER_REGISTRY_KIND;
	event.tags = [['d', SELLER_REGISTRY_DTAG]];
	event.content = JSON.stringify(doc);
	await event.sign(signer);
	await event.publish();
}

/**
 * Add (or extend) a seller entry. `expiresAt` is unix seconds.
 * If the seller already exists with a later expiry, the later one wins.
 */
export async function addSeller(pubkey: string, expiresAt: number): Promise<void> {
	const doc = await fetchRegistry();
	const now = Math.floor(Date.now() / 1000);
	const existing = doc.sellers[pubkey];
	doc.sellers[pubkey] = {
		addedAt: existing?.addedAt ?? now,
		expiresAt: Math.max(existing?.expiresAt ?? 0, expiresAt)
	};
	await publishRegistry(doc);
}

/** Returns true if `pubkey` is an active seller (owner or unexpired registry entry). */
export async function isActiveSeller(pubkey: string): Promise<boolean> {
	if (pubkey === GALLERY_OWNER_PUBKEY) return true;
	const doc = await fetchRegistry();
	const entry = doc.sellers[pubkey];
	if (!entry) return false;
	return entry.expiresAt > Math.floor(Date.now() / 1000);
}

/** Returns the seller's expiry (unix seconds) or null if not registered. */
export async function getSellerExpiry(pubkey: string): Promise<number | null> {
	if (pubkey === GALLERY_OWNER_PUBKEY) return null; // owner has no expiry
	const doc = await fetchRegistry();
	return doc.sellers[pubkey]?.expiresAt ?? null;
}
