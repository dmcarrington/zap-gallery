import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { isNwcConfigured, lookupInvoice } from '$lib/server/nwc';
import { getInvoice, markPaid } from '$lib/server/payments';

export const GET: RequestHandler = async ({ params, url }) => {
	const { slug } = params;
	const paymentHash = url.searchParams.get('payment_hash');

	if (!paymentHash || !slug) {
		return error(400, 'Missing payment_hash parameter');
	}

	const invoice = getInvoice(paymentHash);
	if (!invoice) {
		return error(404, 'Invoice not found');
	}

	// Already marked paid in memory — skip NWC call
	if (invoice.paid) {
		return json({ paid: true });
	}

	if (!isNwcConfigured()) {
		return json({ paid: false });
	}

	try {
		const result = await lookupInvoice(paymentHash);
		if (result.settled_at) {
			markPaid(paymentHash);
			return json({ paid: true });
		}
	} catch (err) {
		console.warn('[api/invoice/status] NWC lookup failed:', err);
	}

	return json({ paid: false });
};
