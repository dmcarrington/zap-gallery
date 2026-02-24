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
		}
	};
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
	return pubkey;
}

export function logout() {
	pubkey = null;
	ndk.signer = undefined;
	if (browser) {
		localStorage.removeItem('nostr-auto-login');
	}
}
