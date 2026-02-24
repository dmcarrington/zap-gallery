declare module '@nostr-dev-kit/ndk-wallet' {
	import type NDK from '@nostr-dev-kit/ndk';

	interface NDKNWCWalletOptions {
		timeout?: number;
		pairingCode?: string;
		pubkey?: string;
		relayUrls?: string[];
		secret?: string;
	}

	class NDKNWCWallet {
		constructor(ndk: NDK, opts: NDKNWCWalletOptions);
		status: string;
		walletId: string;
		on(event: 'ready', cb: () => void): void;
		on(event: 'balance_updated', cb: (balance: { amount: number } | undefined) => void): void;
		lnPay(payment: unknown): Promise<{ preimage: string } | undefined>;
		updateBalance?(): Promise<void>;
		get balance(): { amount: number } | undefined;
	}

	export { NDKNWCWallet };
}
