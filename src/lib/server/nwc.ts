/**
 * Server-side NWC (Nostr Wallet Connect) client.
 *
 * Implements NIP-47 directly using NDK primitives rather than NDKNWCWallet,
 * which has pool/relay management issues in server-side (non-browser) contexts.
 */

import NDK, {
	NDKEvent,
	NDKPrivateKeySigner,
	NDKRelaySet,
	NDKUser,
	type NDKSubscription
} from '@nostr-dev-kit/ndk';
import { env } from '$env/dynamic/private';

const KIND_NWC_REQ = 23194;
const KIND_NWC_RES = 23195;

export interface NwcInvoiceResult {
	invoice: string;
	payment_hash: string;
	amount: number;
	expiry: number;
}

export interface NwcLookupResult {
	payment_hash: string;
	settled_at?: number;
	amount: number;
}

interface NwcConnection {
	ndk: NDK;
	signer: NDKPrivateKeySigner;
	walletPubkey: string;
	relaySet: NDKRelaySet;
}

let connection: NwcConnection | null = null;
let initPromise: Promise<NwcConnection> | null = null;

export function isNwcConfigured(): boolean {
	return !!env.NWC_URI;
}

async function getConnection(): Promise<NwcConnection> {
	if (connection) return connection;
	if (initPromise) return initPromise;

	initPromise = initConnection();
	initPromise.catch(() => {
		initPromise = null;
		connection = null;
	});

	return initPromise;
}

async function initConnection(): Promise<NwcConnection> {
	const nwcUri = env.NWC_URI;
	if (!nwcUri) throw new Error('NWC_URI not configured');

	const url = new URL(nwcUri);
	const walletPubkey = url.host || url.pathname;
	const relayUrls = url.searchParams.getAll('relay');
	const secret = url.searchParams.get('secret');

	if (!walletPubkey || !relayUrls.length || !secret) {
		throw new Error('Invalid NWC_URI: missing pubkey, relay, or secret');
	}

	const signer = new NDKPrivateKeySigner(secret);
	const ndk = new NDK({
		explicitRelayUrls: relayUrls,
		signer
	});

	await ndk.connect();

	// Wait for at least one relay to connect
	await new Promise<void>((resolve, reject) => {
		const timeout = setTimeout(() => reject(new Error('NWC relay connection timeout')), 10000);

		if (ndk.pool.connectedRelays().length > 0) {
			clearTimeout(timeout);
			resolve();
			return;
		}

		ndk.pool.on('relay:connect', () => {
			clearTimeout(timeout);
			resolve();
		});
	});

	connection = {
		ndk,
		signer,
		walletPubkey,
		relaySet: NDKRelaySet.fromRelayUrls(relayUrls, ndk)
	};

	console.log('[server/nwc] Connected to NWC relay');
	return connection;
}

/**
 * Send a NIP-47 request and wait for the response.
 */
async function nwcRequest(
	method: string,
	params: Record<string, unknown>,
	timeoutMs = 15000
): Promise<Record<string, unknown>> {
	const conn = await getConnection();
	const walletUser = new NDKUser({ pubkey: conn.walletPubkey });
	walletUser.ndk = conn.ndk;

	// Build the NWC request event (kind 23194)
	const reqEvent = new NDKEvent(conn.ndk);
	reqEvent.kind = KIND_NWC_REQ;
	reqEvent.tags = [['p', conn.walletPubkey]];
	reqEvent.content = JSON.stringify({ method, params });

	// Encrypt content with NIP-04 to the wallet service
	await reqEvent.encrypt(walletUser, conn.signer, 'nip04');
	await reqEvent.sign(conn.signer);

	// Subscribe for the response BEFORE publishing the request
	const responsePromise = new Promise<Record<string, unknown>>((resolve, reject) => {
		const timer = setTimeout(() => {
			sub.stop();
			reject(new Error(`NWC ${method} timed out after ${timeoutMs}ms`));
		}, timeoutMs);

		const sub: NDKSubscription = conn.ndk.subscribe(
			{
				kinds: [KIND_NWC_RES as number],
				'#e': [reqEvent.id],
				limit: 1
			},
			{ closeOnEose: false }
		);

		sub.on('event', async (event: NDKEvent) => {
			clearTimeout(timer);
			sub.stop();

			try {
				await event.decrypt(walletUser, conn.signer, 'nip04');
				const content = JSON.parse(event.content);

				if (content.error) {
					reject(new Error(`NWC error: ${content.error.message} (${content.error.code})`));
				} else {
					resolve(content.result ?? content);
				}
			} catch (err) {
				reject(err);
			}
		});
	});

	// Publish the request
	await reqEvent.publish(conn.relaySet);
	console.log(`[server/nwc] Published ${method} request (event ${reqEvent.id})`);

	return responsePromise;
}

export async function makeInvoice(
	amountMsats: number,
	description: string
): Promise<NwcInvoiceResult> {
	const result = await nwcRequest('make_invoice', { amount: amountMsats, description });
	return result as unknown as NwcInvoiceResult;
}

export async function lookupInvoice(paymentHash: string): Promise<NwcLookupResult> {
	const result = await nwcRequest('lookup_invoice', { payment_hash: paymentHash });
	return result as unknown as NwcLookupResult;
}
