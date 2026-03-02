# Nostr Zap Gallery

A SvelteKit photo gallery where visitors browse thumbnails and send Lightning zaps via Nostr to unlock full-resolution image downloads. Zero external infrastructure: all data lives on Nostr relays (events) and Blossom media servers (files).

## How It Works

1. The gallery owner uploads images — thumbnails are stored unencrypted on Blossom servers, full-resolution files are encrypted with AES-256-GCM
2. Visitors browse the thumbnail gallery and zap (Lightning payment) an image to purchase it
3. The owner's admin panel detects the zap receipt and delivers the decryption key to the buyer via NIP-04 encrypted DM
4. The buyer's client decrypts and downloads the full-resolution image

## Tech Stack

- **Framework**: SvelteKit (Svelte 5 runes), Tailwind CSS v4, adapter-node
- **Nostr**: NDK (`@nostr-dev-kit/ndk` + `ndk-svelte`) for relay communication
- **Wallet**: NDK Wallet for NWC (NIP-47) zap payments
- **Media**: Blossom servers for image storage (blossom.nostr.build, blossom.band)
- **Encryption**: Web Crypto API (AES-256-GCM)
- **Auth**: NIP-07 browser extensions (Alby, nos2x)

## Prerequisites

- Node.js 22+
- A Nostr keypair (hex pubkey for the gallery owner)
- A NIP-07 browser extension for authentication
- (Optional) An NWC-compatible Lightning wallet for zap payments

## Configuration

Copy `.env.example` to `.env` and fill in the values:

```sh
cp .env.example .env
```

| Variable | Description |
|----------|-------------|
| `PUBLIC_GALLERY_OWNER_PUBKEY` | Hex pubkey of the gallery owner |
| `PUBLIC_BLOSSOM_SERVERS` | Comma-separated Blossom server URLs |
| `PUBLIC_BLOSSOM_MAX_FILE_SIZE_MB` | Max upload size in MiB (default: 20) |
| `PUBLIC_RELAY_URLS` | Comma-separated Nostr relay WebSocket URLs |
| `GALLERY_OWNER_NSEC` | Owner's nsec private key (server-side only) |
| `NWC_URI` | Nostr Wallet Connect URI for Lightning payments |

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
| 30078 | App-specific data (encrypted AES keys) |
| 9735 | Zap receipts |
| 4 | NIP-04 encrypted DMs (key delivery to buyers) |
