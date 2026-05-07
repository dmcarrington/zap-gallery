/**
 * NIP-89 Announcement Publisher — Zap Gallery Pro
 *
 * Publishes a kind 31989 handler announcement to:
 *   - snort.social
 *   - primal.net
 *
 * Usage:
 *   GALLERY_OWNER_NSEC=nsec1... node scripts/publish-nip89.js
 */

const { SimplePool } = require('nostr-tools');
const { finalizeEvent, getPublicKey } = require('nostr-tools');
const { decode } = require('nostr-tools/nip19');
const dotenv = require('dotenv');

dotenv.config();

const RELAYS = [
  'wss://snort.social',
  'wss://primal.net',
];

const GALLEY_NSEC = process.env.GALLERY_OWNER_NSEC;
const APP_URL = 'https://zap-gallery.vercel.app/';

if (!GALLEY_NSEC) {
  console.error('Missing GALLERY_OWNER_NSEC in .env');
  process.exit(1);
}

// Decode nsec to hex sk
let sk;
try {
  const decoded = decode(GALLEY_NSEC);
  if (decoded.type !== 'nsec') throw new Error('Not an nsec');
  sk = decoded.data;
} catch (e) {
  console.error('Invalid nsec:', e.message);
  process.exit(1);
}

const pk = getPublicKey(sk);
console.log('Publishing from pubkey:', pk);

// Build NIP-89 content
const content = JSON.stringify({
  name: 'Zap Gallery Pro',
  description: 'Sell your photography on Nostr. Multi-seller gallery with Lightning payments, NIP-44 encrypted downloads, and Pro tier for unlimited uploads.',
  url: APP_URL,
  icon: `${APP_URL}favicon.png`,
  banner: '',
  supports: ['NIP-07', 'NIP-57', 'NIP-98'],
  service: 'photography',
  relays: RELAYS,
});

// Build the kind 31989 event
const event = {
  kind: 31989,
  created_at: Math.floor(Date.now() / 1000),
  tags: [
    ['d', 'zap-gallery-pro'],
    ['client', 'zap-gallery-pro'],
  ],
  content,
};

// Sign and publish
const signed = finalizeEvent(event, sk);

const pool = new SimplePool();
console.log('Publishing to:', RELAYS.join(', '));
console.log('Event ID:', signed.id);

pool.publish(RELAYS, signed).then(() => {
  console.log('✅ Published successfully!');
}).catch(err => {
  console.error('Publish error:', err);
  process.exit(1);
}).finally(() => {
  pool.close(RELAYS);
});