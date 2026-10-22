import { error } from '@sveltejs/kit';
import { GALLERY_OWNER_PUBKEY, SINGLE_OWNER_MODE } from '$lib/config';
import type { PageLoad } from './$types';

export const load: PageLoad = ({ params }) => {
	if (SINGLE_OWNER_MODE && params.pubkey !== GALLERY_OWNER_PUBKEY) error(404, 'Not found');
};
