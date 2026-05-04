/**
 * Nostr authentication state. Supports NIP-07 browser extensions and
 * nsec private-key entry. Tracks whether the logged-in pubkey is a Pro
 * (registered) seller; that state is loaded from /api/pro/verify which
 * reads the on-chain seller registry.
 */

import { NDKNip07Signer, NDKPrivateKeySigner } from '@nostr-dev-kit/ndk';
import { nip19 } from 'nostr-tools';
import { ndk } from '$lib/ndk';
import { GALLERY_OWNER_PUBKEY } from '$lib/config';
import { browser } from '$app/environment';

let pubkey = $state<string | null>(null);
let pro = $state(false);
let proExpiresAt = $state<number | null>(null);
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
		get isPro() {
			return pro;
		},
		get proExpiresAt() {
			return proExpiresAt;
		}
	};
}

async function checkPro(): Promise<void> {
	if (!pubkey) return;
	try {
		const res = await fetch(`/api/pro/verify?pubkey=${pubkey}`);
		if (!res.ok) return;
		const data = await res.json();
		pro = !!data.pro;
		proExpiresAt = typeof data.expiresAt === 'number' ? data.expiresAt : null;
	} catch {
		pro = false;
		proExpiresAt = null;
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
	checkPro();
	return pubkey;
}

export function logout() {
	pubkey = null;
	pro = false;
	proExpiresAt = null;
	ndk.signer = undefined;
	if (browser) {
		localStorage.removeItem('nostr-auto-login');
	}
}

/** Re-fetch Pro status (e.g. after a successful upgrade payment). */
export async function refreshPro(): Promise<void> {
	await checkPro();
}
