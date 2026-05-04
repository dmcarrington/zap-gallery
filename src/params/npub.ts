/**
 * SvelteKit param matcher: only accept strings that look like a NIP-19 npub.
 * Used by the /[npub=npub] route so static paths (/admin, /pro, /terms, …)
 * take precedence and arbitrary slugs don't collide with the gallery route.
 *
 * Validity is checked against the bech32 character set and the standard
 * npub length (63 chars: 'npub1' + 58 data chars). The /[npub] page does
 * the proper nip19.decode for the actual hex pubkey.
 */
import type { ParamMatcher } from '@sveltejs/kit';

const NPUB_RE = /^npub1[02-9ac-hj-np-z]{58}$/;

export const match: ParamMatcher = (param) => NPUB_RE.test(param);
