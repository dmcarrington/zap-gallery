/**
 * AES-256-GCM helpers for full-resolution image protection.
 *
 * Encrypted blobs are laid out as `iv (12 bytes) || ciphertext+tag`, so the
 * only secret a buyer needs is the key.
 */

const IV_BYTES = 12;

function toBase64(bytes: Uint8Array): string {
	let binary = '';
	for (const b of bytes) binary += String.fromCharCode(b);
	return btoa(binary);
}

function fromBase64(value: string): Uint8Array<ArrayBuffer> {
	const binary = atob(value);
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
	return bytes;
}

async function importKey(keyB64: string, usage: KeyUsage): Promise<CryptoKey> {
	return crypto.subtle.importKey('raw', fromBase64(keyB64), 'AES-GCM', false, [usage]);
}

/** Generate a fresh AES-256 key, returned as base64. */
export function generateImageKey(): string {
	return toBase64(crypto.getRandomValues(new Uint8Array(32)));
}

export async function encryptBlob(data: Blob, keyB64: string): Promise<Blob> {
	const key = await importKey(keyB64, 'encrypt');
	const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
	const ciphertext = await crypto.subtle.encrypt(
		{ name: 'AES-GCM', iv },
		key,
		await data.arrayBuffer()
	);
	return new Blob([iv, ciphertext], { type: 'application/octet-stream' });
}

export async function decryptBlob(
	data: ArrayBuffer,
	keyB64: string,
	mimeType: string
): Promise<Blob> {
	const key = await importKey(keyB64, 'decrypt');
	const iv = data.slice(0, IV_BYTES);
	const plaintext = await crypto.subtle.decrypt(
		{ name: 'AES-GCM', iv },
		key,
		data.slice(IV_BYTES)
	);
	return new Blob([plaintext], { type: mimeType });
}
