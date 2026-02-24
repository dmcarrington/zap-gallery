/**
 * NWC wallet connection state.
 */

import { NDKNWCWallet } from '@nostr-dev-kit/ndk-wallet';
import { ndk } from '$lib/ndk';
import { browser } from '$app/environment';

const NWC_STORAGE_KEY = 'nostr-nwc-pairing';

let wallet = $state<NDKNWCWallet | null>(null);
let status = $state<'disconnected' | 'connecting' | 'ready' | 'failed'>('disconnected');
let balanceSats = $state<number | null>(null);
let error = $state<string | null>(null);

// Restore wallet on load
if (browser) {
	const saved = localStorage.getItem(NWC_STORAGE_KEY);
	if (saved) {
		connectWallet(saved).catch(() => {
			localStorage.removeItem(NWC_STORAGE_KEY);
		});
	}
}

export function getWallet() {
	return {
		get wallet() {
			return wallet;
		},
		get status() {
			return status;
		},
		get balanceSats() {
			return balanceSats;
		},
		get error() {
			return error;
		},
		get isReady() {
			return status === 'ready';
		}
	};
}

export async function connectWallet(pairingCode: string): Promise<void> {
	error = null;
	status = 'connecting';

	try {
		const nwc = new NDKNWCWallet(ndk, { pairingCode, timeout: 60000 });

		nwc.on('ready', () => {
			status = 'ready';
			updateBalance();
		});

		nwc.on('balance_updated', (bal: { amount: number } | undefined) => {
			if (bal) {
				// NWC balance is in msats
				balanceSats = Math.floor(bal.amount / 1000);
			}
		});

		// Wait for ready or timeout
		await new Promise<void>((resolve, reject) => {
			const timeout = setTimeout(() => reject(new Error('Wallet connection timed out')), 30000);
			nwc.on('ready', () => {
				clearTimeout(timeout);
				resolve();
			});
		});

		wallet = nwc;
		if (browser) {
			localStorage.setItem(NWC_STORAGE_KEY, pairingCode);
		}
	} catch (err) {
		status = 'failed';
		error = err instanceof Error ? err.message : 'Failed to connect wallet';
		wallet = null;
		throw err;
	}
}

async function updateBalance() {
	if (!wallet?.updateBalance) return;
	try {
		await wallet.updateBalance();
	} catch {
		// Balance fetch is optional — some wallets don't support get_balance
	}
}

export function disconnectWallet() {
	wallet = null;
	status = 'disconnected';
	balanceSats = null;
	error = null;
	if (browser) {
		localStorage.removeItem(NWC_STORAGE_KEY);
	}
}
