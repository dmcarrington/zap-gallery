# Nostr Zap Gallery

A SvelteKit photo gallery where every Nostr user gets their own gallery and visitors send Lightning zaps to unlock full-resolution image downloads. Zero external infrastructure: all data lives on Nostr relays (events) and Blossom media servers (files).

## How It Works

1. Any logged-in Nostr user can publish images at `/<their-npub>` — thumbnails are stored unencrypted on Blossom servers, full-resolution files are encrypted with AES-256-GCM
2. Visitors browse the thumbnail gallery and zap (Lightning payment) an image to purchase it
3. The seller's admin panel detects the zap receipt and delivers the decryption key to the buyer via NIP-04 encrypted DM
4. The buyer's client decrypts and downloads the full-resolution image

## Tiers

| Tier | Cost | Listings |
|------|------|----------|
| Free | — | Capped at `PUBLIC_FREE_UPLOAD_LIMIT` (default `1`) |
| Pro  | `PUBLIC_PRO_PRICE_SATS` sats for `PUBLIC_PRO_DURATION_DAYS` days | Unlimited |

The gallery owner (the pubkey that runs the deployment, set via `PUBLIC_GALLERY_OWNER_PUBKEY`) is always treated as an active Pro seller.

### Pro Upgrade Flow

1. Buyer visits `/pro` and clicks **Upgrade** — the server creates a Lightning invoice via NWC (`POST /api/pro/invoice`)
2. Buyer pays the BOLT11 invoice (QR code or copy-paste); the page polls `POST /api/pro/verify`
3. On settlement, the server appends/extends the buyer's pubkey in the **seller registry** — a parameterised replaceable kind 30078 event signed by the gallery owner with `d`-tag `zap-gallery-sellers`
4. Pro status is read back from relays via `GET /api/pro/verify?pubkey=…`, so it survives deploys with no database

## Routes

| Path | Purpose |
|------|---------|
| `/` | Landing page; logged-in users see a link to their own gallery |
| `/<npub>` | A specific user's gallery |
| `/image/<pubkey>/<slug>` | Single-image purchase page |
| `/admin` | Owner / seller dashboard (upload, manage listings, deliver keys) |
| `/pro` | Pro upgrade page (invoice + payment) |
| `/terms`, `/privacy` | Legal pages |

## Tech Stack

- **Framework**: SvelteKit (Svelte 5 runes), Tailwind CSS v4, adapter-node
- **Nostr**: NDK (`@nostr-dev-kit/ndk` + `ndk-svelte`) for relay communication
- **Wallet**: NDK Wallet for NWC (NIP-47) zap payments and Pro upgrade invoices
- **Media**: Blossom servers for image storage (blossom.nostr.build, blossom.band)
- **Encryption**: Web Crypto API (AES-256-GCM)
- **Auth**: NIP-07 browser extensions (Alby, nos2x) or nsec entry

## Prerequisites

- Node.js 22+
- A Nostr keypair (hex pubkey for the gallery owner)
- A NIP-07 browser extension for authentication
- An NWC-compatible Lightning wallet (required for Pro upgrade invoices and zap payments)

## Configuration

Copy `.env.example` to `.env` and fill in the values:

```sh
cp .env.example .env
```

| Variable | Description |
|----------|-------------|
| `PUBLIC_GALLERY_OWNER_PUBKEY` | Hex pubkey of the gallery owner; signs the seller registry and is implicitly Pro |
| `PUBLIC_BLOSSOM_SERVERS` | Comma-separated Blossom server URLs |
| `PUBLIC_BLOSSOM_MAX_FILE_SIZE_MB` | Max upload size in MiB (default: 20) |
| `PUBLIC_RELAY_URLS` | Comma-separated Nostr relay WebSocket URLs |
| `PUBLIC_PRO_PRICE_SATS` | Price of a Pro upgrade in sats (default: 1000) |
| `PUBLIC_PRO_DURATION_DAYS` | Duration of a Pro upgrade in days (default: 30) |
| `PUBLIC_FREE_UPLOAD_LIMIT` | Max listings allowed on the free tier (default: 1) |
| `GALLERY_OWNER_NSEC` | Owner's nsec private key (server-side only); used to sign the seller registry |
| `NWC_URI` | Nostr Wallet Connect URI; used to issue and look up Pro invoices |

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
| 9735 | Zap receipts |
| 4 | NIP-04 encrypted DMs (key delivery to buyers) |
