<script lang="ts">
	import { page } from '$app/state';
	import { nip19 } from 'nostr-tools';
	import GalleryView from '$lib/components/GalleryView.svelte';

	const pubkey = $derived(decodeNpub(page.params.npub ?? ''));

	function decodeNpub(value: string): string | null {
		try {
			const decoded = nip19.decode(value);
			return decoded.type === 'npub' ? (decoded.data as string) : null;
		} catch {
			return null;
		}
	}
</script>

{#key pubkey}
	<GalleryView {pubkey} />
{/key}
