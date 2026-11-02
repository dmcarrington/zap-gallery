# Nostr Zap Gallery

A SvelteKit photo gallery where every Nostr user gets their own gallery and visitors send Lightning zaps to unlock full-resolution image downloads. Zero external infrastructure: all data lives on Nostr relays (events) and Blossom media servers (files).

## How It Works

1. Any logged-in Nostr user can publish images at `/<their-npub>` — thumbnails are stored unencrypted on Blossom servers, full-resolution files are encrypted with AES-256-GCM
2. Visitors browse the thumbnail gallery and zap an image to buy it. The zap (NIP-57) goes straight to the seller's Lightning address (`lud16` in their Nostr profile)
3. The server verifies the zap receipt — signed by the seller's Lightning provider, with a buyer-signed zap request for this listing and an invoice covering the price — then releases the decryption key, encrypted to the buyer (also sent as a NIP-04 encrypted DM)
4. The buyer's client downloads the encrypted file and decrypts it in the browser

Sellers need a zap-capable Lightning address in their Nostr profile. If a seller has none and `NWC_URI` is set, buyers pay an invoice from the gallery's own wallet instead, and the server confirms settlement over NWC.

## Tiers

| Tier | Cost | Listings |
|------|------|----------|
| Free | — | Capped at `PUBLIC_FREE_UPLOAD_LIMIT` (default `1`) |
| Seller pass | `PUBLIC_SELLER_PASS_PRICE_SATS` sats for `PUBLIC_SELLER_PASS_DURATION_DAYS` days | Unlimited |

A seller pass is how an operator sells space on *their* deployment to other Nostr users; it adds nothing for the owner. The gallery owner (set via `PUBLIC_GALLERY_OWNER_PUBKEY`) can always list without limits. Anyone can run their own instance instead.

### Single-owner mode

Set `PUBLIC_SINGLE_OWNER_MODE=true` to run a personal gallery: `/` shows the owner's gallery, `/<npub>` redirects to `/` for the owner and 404s for anyone else, seller passes are switched off, and the invoice and download APIs only sell the owner's listings.

### Seller Pass Flow

1. A user visits `/sell` and clicks **Get a seller pass** — the server creates a Lightning invoice via NWC (`POST /api/seller-pass/invoice`)
2. They pay the BOLT11 invoice (QR code or copy-paste); the page polls `POST /api/seller-pass/verify`
3. On settlement, the server appends/extends their pubkey in the **seller registry** — a parameterised replaceable kind 30078 event signed by the gallery owner with `d`-tag `zap-gallery-sellers`
4. Pass status is read back from relays via `GET /api/seller-pass/verify?pubkey=…`, so it survives deploys with no database

## Routes

| Path | Purpose |
|------|---------|
| `/` | Landing page; logged-in users see a link to their own gallery |
| `/<npub>` | A specific user's gallery |
| `/image/<pubkey>/<slug>` | Single-image purchase page |
| `/admin` | Owner / seller dashboard (upload, manage listings, deliver keys) |
| `/sell` | Seller pass page (invoice + payment) |
| `/terms`, `/privacy` | Legal pages |

## Tech Stack

- **Framework**: SvelteKit (Svelte 5 runes), Tailwind CSS v4, adapter-node
- **Nostr**: NDK (`@nostr-dev-kit/ndk` + `ndk-svelte`) for relay communication
- **Payments**: NIP-57 zaps to the seller's Lightning address; NWC (NIP-47) for seller pass invoices and the gallery-wallet fallback
- **Media**: Blossom servers for image storage (blossom.nostr.build, blossom.band)
- **Encryption**: Web Crypto API (AES-256-GCM)
- **Auth**: NIP-07 browser extensions (Alby, nos2x) or nsec entry

## Prerequisites

- Node.js 22+
- A Nostr keypair (hex pubkey for the gallery owner)
- A NIP-07 browser extension for authentication
- A zap-capable Lightning address on each seller's Nostr profile
- Optional: an NWC-compatible Lightning wallet, needed for seller passes and for sellers without a zap-capable address

## Configuration

Copy `.env.example` to `.env` and fill in the values:

```sh
cp .env.example .env
```

| Variable | Description |
|----------|-------------|
| `PUBLIC_GALLERY_OWNER_PUBKEY` | Hex pubkey of the gallery owner; signs the seller registry and never needs a seller pass |
| `PUBLIC_BLOSSOM_SERVERS` | Comma-separated Blossom server URLs for thumbnails |
| `PUBLIC_BLOSSOM_ENCRYPTED_SERVERS` | Blossom servers for encrypted full-res files; must accept `application/octet-stream` (default: `https://nostr.download`) |
| `PUBLIC_BLOSSOM_MAX_FILE_SIZE_MB` | Max upload size in MiB (default: 20) |
| `PUBLIC_RELAY_URLS` | Comma-separated Nostr relay WebSocket URLs |
| `PUBLIC_SELLER_PASS_PRICE_SATS` | Price of a seller pass in sats (default: 1000) |
| `PUBLIC_SELLER_PASS_DURATION_DAYS` | How long a seller pass lasts, in days (default: 30) |
| `PUBLIC_FREE_UPLOAD_LIMIT` | Max listings for users without a seller pass (default: 1) |
| `PUBLIC_SINGLE_OWNER_MODE` | `true` to serve only the owner's gallery at `/` and disable other sellers and seller passes (default: `false`) |
| `GALLERY_OWNER_NSEC` | Owner's nsec private key (server-side only); used to sign the seller registry |
| `NWC_URI` | Optional Nostr Wallet Connect URI; issues seller pass invoices, and image invoices for sellers who can't receive zaps |

## Development

Install dependencies and start the dev server:

```sh
npm install
npm run dev
```

The dev server runs at http://localhost:5173.

### Other Commands

```sh
npm run check        # Run svelte-check (TypeScript + Svelte diagnostics)
npm run build        # Production build (outputs to build/)
npm run preview      # Preview the production build locally
```

## Deployment

### Node

```sh
npm run build
node build
```

The server listens on port 3000 by default (set `PORT` to override).

### Docker

```sh
docker build -t zap-gallery .
docker run -p 3000:3000 --env-file .env zap-gallery
```

## Nostr Event Kinds

| Kind | Purpose |
|------|---------|
| 30024 | Image listing (title, price, Blossom URLs) |
| 30078 | App-specific data — encrypted AES keys (`d`-tag: `zap-gallery-key:{slug}`) and the seller registry (`d`-tag: `zap-gallery-sellers`) |
| 9734 / 9735 | Zap request (signed by the buyer) and zap receipt (signed by the seller's Lightning provider) — proof of purchase |
| 4 | NIP-04 encrypted DMs (key delivery to buyers) |
