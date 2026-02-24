/**
 * AES-256-GCM encryption/decryption for image content protection.
 * Uses the Web Crypto API (crypto.subtle).
 */

export interface EncryptedPayload {
	encryptedBlob: Blob;
	key: string; // base64-encoded AES-256 key
	iv: string; // base64-encoded 12-byte IV
}

function toBase64(buffer: ArrayBuffer): string {
	return btoa(String.fromCharCode(...new Uint8Array(buffer)));
}

function fromBase64(b64: string): ArrayBuffer {
	const binary = atob(b64);
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) {
		bytes[i] = binary.charCodeAt(i);
	}
	return bytes.buffer;
}

export async function encryptImage(file: File | Blob): Promise<EncryptedPayload> {
	const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, [
		'encrypt',
		'decrypt'
	]);

	const iv = crypto.getRandomValues(new Uint8Array(12));
	const plaintext = await file.arrayBuffer();

	const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext);

	const rawKey = await crypto.subtle.exportKey('raw', key);

	return {
		encryptedBlob: new Blob([ciphertext], { type: 'application/octet-stream' }),
		key: toBase64(rawKey),
		iv: toBase64(iv.buffer)
	};
}

export async function decryptImage(
	encryptedBlob: Blob,
	keyB64: string,
	ivB64: string,
	mimeType: string = 'image/jpeg'
): Promise<Blob> {
	const rawKey = fromBase64(keyB64);
	const iv = fromBase64(ivB64);

	const key = await crypto.subtle.importKey('raw', rawKey, { name: 'AES-GCM', length: 256 }, false, [
		'decrypt'
	]);

	const ciphertext = await encryptedBlob.arrayBuffer();
	const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: new Uint8Array(iv) }, key, ciphertext);

	return new Blob([plaintext], { type: mimeType });
}
