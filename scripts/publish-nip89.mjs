/**
 * NIP-89 Announcement Publisher — Zap Gallery Pro
 * Uses raw nostr-tools instead of NDK to avoid connection hangs.
 *
 * Setup: GALLERY_OWNER_NSEC already in .env
 * Run: node scripts/publish-nip89.mjs
 */

import 'dotenv/config';
import { SimplePool, finalizeEvent, getPublicKey } from 'nostr-tools';
import { decode } from 'nostr-tools/nip19';

const RELAYS = ['wss://snort.social', 'wss://primal.net'];
const APP_URL = 'https://zap-gallery.vercel.app/';

const GALLERY_NSEC = process.env.GALLERY_OWNER_NSEC;

if (!GALLERY_NSEC) {
  console.error('Error: GALLERY_OWNER_NSEC not found in .env');
  process.exit(1);
}

let sk;
try {
  sk = decode(GALLERY_NSEC).data;
} catch (e) {
  console.error('Invalid nsec:', e.message);
  process.exit(1);
}

const pk = getPublicKey(sk);
console.log('Pubkey:', pk);

const content = JSON.stringify({
  name: 'Zap Gallery Pro',
  description:
    'Sell your photography on Nostr. Multi-seller gallery with Lightning payments, NIP-44 encrypted downloads, and Pro tier for unlimited uploads.',
  url: APP_URL,
  icon: `${APP_URL}favicon.png`,
  banner: '',
  supports: ['NIP-07', 'NIP-57', 'NIP-98'],
  service: 'photography',
  relays: RELAYS,
});

const unsignedEvent = {
  kind: 31989,
  created_at: Math.floor(Date.now() / 1000),
  tags: [
    ['d', 'zap-gallery-pro'],
    ['client', 'zap-gallery-pro'],
  ],
  content,
};

const signed = finalizeEvent(unsignedEvent, sk);
console.log('Event ID:', signed.id);

const pool = new SimplePool();

// Publish with timeout
const publishTimeout = setTimeout(() => {
  console.error('Publish timeout — event may still be in flight');
  pool.close(RELAYS);
  process.exit(1);
}, 20000);

try {
  await pool.publish(RELAYS, signed);
  clearTimeout(publishTimeout);
  console.log('✅ Published!');
  console.log('  https://snort.social/e/' + signed.id);
  console.log('  https://primal.net/e/' + signed.id);
} catch (err) {
  clearTimeout(publishTimeout);
  console.error('Error:', err.message);
} finally {
  pool.close(RELAYS);
  process.exit(0);
}