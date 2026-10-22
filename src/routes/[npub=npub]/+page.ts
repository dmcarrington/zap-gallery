import { error, redirect } from '@sveltejs/kit';
import { nip19 } from 'nostr-tools';
import { GALLERY_OWNER_PUBKEY, SINGLE_OWNER_MODE } from '$lib/config';
import type { PageLoad } from './$types';

// In single-owner mode the owner's gallery lives at `/`; other npubs aren't served.
export const load: PageLoad = ({ params }) => {
	if (!SINGLE_OWNER_MODE) return;
	if (GALLERY_OWNER_PUBKEY && params.npub === nip19.npubEncode(GALLERY_OWNER_PUBKEY)) {
		redirect(307, '/');
	}
	error(404, 'Not found');
};
