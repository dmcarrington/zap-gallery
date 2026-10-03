import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { verifyInvoiceToken, isInvoiceSettled } from '$lib/server/payments';

export const GET: RequestHandler = async ({ params, url }) => {
	const { slug } = params;

	const claim = verifyInvoiceToken(url.searchParams.get('token'));
	if (!claim || claim.slug !== slug) {
		return error(400, 'Missing or invalid token parameter');
	}

	try {
		return json({ paid: await isInvoiceSettled(claim) });
	} catch (err) {
		console.warn('[api/invoice/status] NWC lookup failed:', err);
		return json({ paid: false });
	}
};
