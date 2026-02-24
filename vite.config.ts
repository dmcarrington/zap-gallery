import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';
import path from 'path';

export default defineConfig({
	plugins: [sveltekit(), tailwindcss()],
	resolve: {
		alias: {
			// ndk-wallet ships source but no dist — alias to source directly
			'@nostr-dev-kit/ndk-wallet': path.resolve(
				'node_modules/@nostr-dev-kit/ndk-wallet/src/index.ts'
			)
		}
	}
});
