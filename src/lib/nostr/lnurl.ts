/**
 * LNURL-pay lookup for NIP-57 zaps. Runs in the browser and on the server.
 *
 * A seller can be paid by zap when their kind 0 profile has a lud16
 * Lightning address whose LNURL-pay endpoint sets `allowsNostr` and
 * publishes the `nostrPubkey` that signs its zap receipts.
 */

export interface ZapEndpoint {
	callback: string;
	/** Key the seller's Lightning provider signs kind 9735 receipts with */
	nostrPubkey: string;
	minSendable: number; // msats
	maxSendable: number; // msats
}

const PUBKEY_HEX = /^[0-9a-f]{64}$/;

/** `name@domain` → `https://domain/.well-known/lnurlp/name` */
export function lud16ToUrl(lud16: string): string | null {
	const [name, domain, ...rest] = lud16.trim().toLowerCase().split('@');
	if (!name || !domain || rest.length) return null;
	return `https://${domain}/.well-known/lnurlp/${encodeURIComponent(name)}`;
}

/** Read the lud16 Lightning address from kind 0 profile content. */
export function profileLud16(content: string): string | null {
	try {
		const lud16 = JSON.parse(content)?.lud16;
		return typeof lud16 === 'string' && lud16.includes('@') ? lud16 : null;
	} catch {
		return null;
	}
}

export async function fetchZapEndpoint(
	lud16: string,
	timeoutMs = 8000
): Promise<ZapEndpoint | null> {
	const url = lud16ToUrl(lud16);
	if (!url) return null;

	try {
		const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
		if (!res.ok) return null;
		const data = await res.json();
		if (
			data?.tag !== 'payRequest' ||
			data.allowsNostr !== true ||
			typeof data.callback !== 'string' ||
			typeof data.nostrPubkey !== 'string' ||
			!PUBKEY_HEX.test(data.nostrPubkey)
		) {
			return null;
		}
		return {
			callback: data.callback,
			nostrPubkey: data.nostrPubkey,
			minSendable: Number(data.minSendable) || 1000,
			maxSendable: Number(data.maxSendable) || Number.MAX_SAFE_INTEGER
		};
	} catch {
		return null;
	}
}

/** Amount in msats from a BOLT11 invoice, or null if it has none. */
export function invoiceAmountMsats(sections: { name: string; value?: unknown }[]): number | null {
	const amount = sections.find((s) => s.name === 'amount')?.value;
	return typeof amount === 'string' ? Number(amount) : null;
}
