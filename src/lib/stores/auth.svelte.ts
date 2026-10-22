/**
 * Nostr authentication state. Supports NIP-07 browser extensions and
 * nsec private-key entry. Tracks whether the logged-in pubkey holds a seller
 * pass (is a registered seller); that state is loaded from /api/seller-pass/verify which
 * reads the on-chain seller registry.
 */

import { NDKNip07Signer, NDKPrivateKeySigner } from '@nostr-dev-kit/ndk';
import { nip19 } from 'nostr-tools';
import { ndk } from '$lib/ndk';
import { GALLERY_OWNER_PUBKEY } from '$lib/config';
import { browser } from '$app/environment';

let pubkey = $state<string | null>(null);
let sellerPass = $state(false);
let sellerPassExpiresAt = $state<number | null>(null);
let isLoggedIn = $derived(pubkey !== null);
let isOwner = $derived(pubkey !== null && pubkey === GALLERY_OWNER_PUBKEY);

if (browser && localStorage.getItem('nostr-auto-login') === 'true') {
	login().catch(() => {
		localStorage.removeItem('nostr-auto-login');
	});
}

export function getAuth() {
	return {
		get pubkey() {
			return pubkey;
		},
		get isLoggedIn() {
			return isLoggedIn;
		},
		get isOwner() {
			return isOwner;
		},
		get hasSellerPass() {
			return sellerPass;
		},
		get sellerPassExpiresAt() {
			return sellerPassExpiresAt;
		}
	};
}

async function checkSellerPass(): Promise<void> {
	if (!pubkey) return;
	try {
		const res = await fetch(`/api/seller-pass/verify?pubkey=${pubkey}`);
		if (!res.ok) return;
		const data = await res.json();
		sellerPass = !!data.active;
		sellerPassExpiresAt = typeof data.expiresAt === 'number' ? data.expiresAt : null;
	} catch {
		sellerPass = false;
		sellerPassExpiresAt = null;
	}
}

export async function login(nsec?: string): Promise<string> {
	if (!browser) throw new Error('Login is only available in the browser');

	if (nsec) {
		let hexSk: string;
		try {
			const decoded = nip19.decode(nsec);
			if (decoded.type !== 'nsec') throw new Error('Not an nsec');
			// nostr-tools 2.x returns Uint8Array for nsec.data; NDKPrivateKeySigner takes a hex string.
			const bytes = decoded.data as Uint8Array;
			hexSk = Array.from(bytes)
				.map((b) => b.toString(16).padStart(2, '0'))
				.join('');
		} catch {
			throw new Error('Invalid nsec format');
		}
		const signer = new NDKPrivateKeySigner(hexSk);
		ndk.signer = signer;
		const user = await signer.user();
		pubkey = user.pubkey;
	} else {
		if (typeof window.nostr === 'undefined') {
			throw new Error(
				'No Nostr extension found. Install Alby (getalby.com) or nos2x, or use nsec login below.'
			);
		}
		const signer = new NDKNip07Signer();
		ndk.signer = signer;
		const user = await signer.user();
		pubkey = user.pubkey;
	}

	localStorage.setItem('nostr-auto-login', 'true');
	checkSellerPass();
	return pubkey;
}

export function logout() {
	pubkey = null;
	sellerPass = false;
	sellerPassExpiresAt = null;
	ndk.signer = undefined;
	if (browser) {
		localStorage.removeItem('nostr-auto-login');
	}
}

/** Re-fetch seller pass status (e.g. after a successful pass payment). */
export async function refreshSellerPass(): Promise<void> {
	await checkSellerPass();
}
