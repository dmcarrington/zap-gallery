declare module '@nostr-dev-kit/ndk-wallet' {
	import type NDK from '@nostr-dev-kit/ndk';

	interface NDKNWCWalletOptions {
		timeout?: number;
		pairingCode?: string;
		pubkey?: string;
		relayUrls?: string[];
		secret?: string;
	}

	interface NDKNWCMakeInvoiceResult {
		invoice: string;
		preimage: string;
		payment_hash: string;
		amount: number;
		description: string;
		description_hash: string;
		expiry: number;
		metadata?: Record<string, unknown>;
	}

	interface NDKNWCTransaction {
		type: 'incoming' | 'outgoing';
		invoice?: string;
		description?: string;
		description_hash?: string;
		preimage?: string;
		payment_hash: string;
		amount: number;
		fees_paid?: number;
		created_at: number;
		expires_at?: number;
		settled_at?: number;
		metadata?: Record<string, unknown>;
	}

	interface NDKNWCRequestMap {
		pay_invoice: { invoice: string };
		make_invoice: { amount: number; description?: string; description_hash?: string; expiry?: number };
		lookup_invoice: { payment_hash?: string; invoice?: string };
		list_transactions: Record<string, never>;
		get_balance: Record<string, never>;
		get_info: Record<string, never>;
	}

	interface NDKNWCResponseMap {
		pay_invoice: { preimage: string };
		make_invoice: NDKNWCMakeInvoiceResult;
		lookup_invoice: NDKNWCTransaction;
		list_transactions: { transactions: NDKNWCTransaction[] };
		get_balance: { balance: number };
		get_info: { alias?: string; network?: string };
	}

	interface NDKNWCResponseBase<T> {
		result_type: string;
		result?: T;
		error?: { code: string; message: string };
	}

	class NDKNWCWallet {
		constructor(ndk: NDK, opts: NDKNWCWalletOptions);
		status: string;
		walletId: string;
		on(event: 'ready', cb: () => void): void;
		on(event: 'balance_updated', cb: (balance: { amount: number } | undefined) => void): void;
		lnPay(payment: unknown): Promise<{ preimage: string } | undefined>;
		makeInvoice(amount: number, description: string): Promise<NDKNWCMakeInvoiceResult>;
		req<M extends keyof NDKNWCRequestMap>(
			method: M,
			params: NDKNWCRequestMap[M]
		): Promise<NDKNWCResponseBase<NDKNWCResponseMap[M]>>;
		updateBalance?(): Promise<void>;
		get balance(): { amount: number } | undefined;
	}

	export { NDKNWCWallet };
	export type {
		NDKNWCMakeInvoiceResult,
		NDKNWCTransaction,
		NDKNWCRequestMap,
		NDKNWCResponseMap,
		NDKNWCResponseBase
	};
}
