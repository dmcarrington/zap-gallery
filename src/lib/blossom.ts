/**
 * Blossom upload/download helpers.
 */

import { BlossomClient, createUploadAuth } from 'blossom-client-sdk';
import type { Signer, SignedEvent } from 'blossom-client-sdk';
import { BLOSSOM_SERVERS, BLOSSOM_MAX_FILE_SIZE_BYTES, BLOSSOM_MAX_FILE_SIZE_MB } from './config';

export interface BlobDescriptor {
	url: string;
	sha256: string;
	size: number;
	type?: string;
	uploaded?: number;
}

export function validateFileSize(file: File | Blob): { ok: boolean; error?: string } {
	if (file.size > BLOSSOM_MAX_FILE_SIZE_BYTES) {
		const sizeMB = (file.size / (1024 * 1024)).toFixed(1);
		return {
			ok: false,
			error: `File is ${sizeMB} MB — exceeds the ${BLOSSOM_MAX_FILE_SIZE_MB} MB limit. Choose a smaller file or reduce resolution/quality.`
		};
	}
	return { ok: true };
}

/**
 * Create a NIP-07 compatible signer for Blossom auth events.
 * This wraps window.nostr.signEvent to match the Signer type expected by blossom-client-sdk.
 */
export function createNip07Signer(): Signer {
	if (!window.nostr) throw new Error('Nostr extension required');

	const nostr = window.nostr;
	return async (draft) => {
		const signed = await nostr.signEvent(draft as Record<string, unknown>);
		return signed as unknown as SignedEvent;
	};
}

export async function uploadToBlossom(
	file: File | Blob,
	signer: Signer
): Promise<BlobDescriptor> {
	const sizeCheck = validateFileSize(file);
	if (!sizeCheck.ok) {
		throw new Error(sizeCheck.error);
	}

	const errors: string[] = [];

	for (const server of BLOSSOM_SERVERS) {
		try {
			const blob = await BlossomClient.uploadBlob(server, file, {
				onAuth: async (serverUrl, sha256, type) => {
					return createUploadAuth(signer, sha256, { type, servers: [serverUrl] });
				}
			});
			return blob as BlobDescriptor;
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			errors.push(`${server}: ${msg}`);
		}
	}

	throw new Error(`Upload failed on all servers:\n${errors.join('\n')}`);
}

export async function generateThumbnail(file: File, maxWidth: number = 400): Promise<Blob> {
	return new Promise((resolve, reject) => {
		const img = new Image();
		const url = URL.createObjectURL(file);

		img.onload = () => {
			URL.revokeObjectURL(url);

			const scale = Math.min(1, maxWidth / img.width);
			const width = Math.round(img.width * scale);
			const height = Math.round(img.height * scale);

			const canvas = document.createElement('canvas');
			canvas.width = width;
			canvas.height = height;

			const ctx = canvas.getContext('2d');
			if (!ctx) {
				reject(new Error('Failed to get canvas context'));
				return;
			}

			ctx.drawImage(img, 0, 0, width, height);
			canvas.toBlob(
				(blob) => {
					if (blob) resolve(blob);
					else reject(new Error('Failed to create thumbnail blob'));
				},
				'image/jpeg',
				0.8
			);
		};

		img.onerror = () => {
			URL.revokeObjectURL(url);
			reject(new Error('Failed to load image'));
		};

		img.src = url;
	});
}
