import { error } from '@sveltejs/kit';
import { SINGLE_OWNER_MODE } from '$lib/config';
import type { PageLoad } from './$types';

export const load: PageLoad = () => {
	if (SINGLE_OWNER_MODE) error(404, 'Not found');
};
