/**
 * Nostr authentication state using NIP-07 browser extensions.
 */

import { NDKNip07Signer } from '@nostr-dev-kit/ndk';
import { ndk } from '$lib/ndk';
import { GALLERY_OWNER_PUBKEY } from '$lib/config';
import { browser } from '$app/environment';

let pubkey = $state<string | null>(null);
let isLoggedIn = $derived(pubkey !== null);
let isOwner = $derived(pubkey !== null && pubkey === GALLERY_OWNER_PUBKEY);

// Pro state — fetched from server on login
let pro = $state(false);
let proExpiresAt = $state<string | null>(null);

// Restore login state on load
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
		const data = await res.json();
		pro = data.pro;
		proExpiresAt = data.expiresAt;
	} catch {
		pro = false;
		proExpiresAt = null;
	}
}

export async function login(): Promise<string> {
	if (!browser) throw new Error('Login is only available in the browser');

	if (typeof window.nostr === 'undefined') {
		throw new Error(
			'No Nostr extension found. Install Alby (getalby.com) or nos2x to log in.'
		);
	}

	const signer = new NDKNip07Signer();
	ndk.signer = signer;

	const user = await signer.user();
	pubkey = user.pubkey;

	localStorage.setItem('nostr-auto-login', 'true');

	// Check Pro status in background
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

/** Manual refresh of Pro status (e.g. after payment) */
export async function refreshPro(): Promise<void> {
	await checkPro();
}
