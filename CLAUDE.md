# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Nostr Zap Gallery — a SvelteKit photo gallery where visitors browse thumbnails and send Lightning zaps via Nostr to unlock full-resolution image downloads. Zero external infrastructure: all data lives on Nostr relays (events) and Blossom media servers (files).

## Build & Dev Commands

- `npm run dev` — Start dev server (port 5173)
- `npm run build` — Production build (outputs to `build/`, uses adapter-node)
- `npm run preview` — Preview production build locally
- `npm run check` — Run svelte-check (TypeScript + Svelte diagnostics)
- `node build` — Run production server (after build)

## Architecture

- **Framework**: SvelteKit with Svelte 5 runes, Tailwind CSS v4, adapter-node
- **Nostr**: `@nostr-dev-kit/ndk` (v2.15.2, pinned to match ndk-svelte) + `@nostr-dev-kit/ndk-svelte`
- **Wallet**: `@nostr-dev-kit/ndk-wallet` for NWC (NIP-47) zap payments
- **Media**: `blossom-client-sdk` for Blossom upload/download (servers: blossom.nostr.build, blossom.band; 20 MiB free limit)
- **Encryption**: Web Crypto API (AES-256-GCM) for full-res image protection
- **Auth**: NIP-07 browser extensions (Alby, nos2x)
- **Key delivery**: NIP-04 encrypted DMs (kind 4) from owner to buyer after verified zap

### Key Files

- `src/lib/ndk.ts` — NDK singleton with relay config
- `src/lib/config.ts` — Environment-driven config (owner pubkey, Blossom servers, limits)
- `src/lib/crypto.ts` — AES-256-GCM encrypt/decrypt helpers
- `src/lib/blossom.ts` — Blossom upload with BUD-06 preflight and size validation
- `src/lib/nostr/events.ts` — Event kind constants and gallery image parsing
- `src/lib/nostr/zaps.ts` — Zap receipt verification and monitoring (NIP-57)
- `src/lib/nostr/keys.ts` — Image secret storage (kind 30078: AES key + ciphertext URL)
- `src/lib/upload.ts` — Client-side thumbnail, encrypt, Blossom upload and listing publish
- `src/lib/receipts.ts` — Buyer's invoice tokens in localStorage (resume / re-download)
- `src/lib/server/listings.ts` — Server-side listing lookup (source of truth for price)
- `src/lib/server/payments.ts` — HMAC-signed invoice tokens; settlement re-checked over NWC (no server state)
- `src/lib/stores/auth.svelte.ts` — Reactive auth state (login/logout/isOwner)
- `src/lib/stores/wallet.svelte.ts` — NWC wallet connection state
- `src/lib/ndk-wallet.d.ts` — Type declarations for ndk-wallet (ships source without dist)

### Content Protection Flow

1. Seller uploads image → thumbnail uploaded unencrypted, full-res encrypted in the browser with AES-256-GCM; only ciphertext goes to Blossom
2. AES key + ciphertext URL stored in a kind 30078 event signed by the seller, NIP-04 encrypted to the gallery owner's pubkey. The listing (kind 30024) carries no full-res URL
3. Buyer requests an invoice (`POST /api/invoice/[slug]`) → server reads the price from the seller's listing, creates the invoice via NWC and returns an HMAC-signed token binding payment hash, slug, seller, buyer and amount
4. Buyer pays → `POST /api/download/[slug]` verifies the token and re-checks settlement with the wallet (fallback: kind 9735 zap receipt), decrypts the secret with `GALLERY_OWNER_NSEC` and returns it; a NIP-04 DM (kind 4) with the same secret is sent in the background
5. Buyer's client downloads the encrypted blob from Blossom and decrypts it locally

Listings published before encryption was restored carry a public `full_res_url` tag and are served as-is.

### NDK Version Note

`@nostr-dev-kit/ndk` is pinned to v2.15.2 to match the version bundled by `ndk-svelte`. `ndk-wallet` ships source without dist — resolved via a Vite alias in `vite.config.ts`.

### Nostr Event Kinds Used

| Kind | Purpose |
|------|---------|
| 30024 | Image listing (per-image: title, price, Blossom URLs) |
| 30078 | App-specific data (encrypted AES keys, d-tag: `zap-gallery-key:{slug}`) |
| 9735 | Zap receipts |
| 4 | NIP-04 encrypted DMs (key delivery to buyers) |

## Environment Variables

See `.env.example`. All prefixed with `PUBLIC_` for SvelteKit client-side access.

## Deployment

- **Node**: `npm run build && node build` (PORT defaults to 3000)
- **Docker**: `docker build -t zap-gallery . && docker run -p 3000:3000 --env-file .env zap-gallery`
