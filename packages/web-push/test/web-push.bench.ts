import { expect, test } from 'vite-plus/test';
import webPush from 'web-push';
import * as WebPush from '@portable/web-push';
import { base64url, fromBase64url, userAgent } from './utils.js';

// web-push encrypts and signs with node:crypto's synchronous C++ calls. Node runs each WebCrypto
// call on its thread pool, and the 9 calls an encryption makes cost about 50 µs each in thread
// handoffs alone, so web-push is about 3.5 times faster on one message at a time and about 1.4
// times faster on many concurrent messages. It is measured for reference. The 25% assertions
// compare with the same WebCrypto calls made directly, with no validation or encoding.

const subtle = crypto.subtle;
const utf8 = new TextEncoder();
const ecdh = { name: 'ECDH', namedCurve: 'P-256' };
const agent = await userAgent('https://fcm.googleapis.com/fcm/send/abc');
const vapid = { subject: 'mailto:ops@example.com', ...(await WebPush.generateVapidKeys()) };
const payload = JSON.stringify({
  title: 'New message',
  body: 'Ada: are we still on for lunch tomorrow? I booked a table at noon.',
  icon: '/icons/192.png',
  data: { url: '/inbox/42', id: 'msg_01HjtXJ1aCBJQm2QZh3E1UCU' },
});
const { p256dh, auth } = agent.subscription.keys;

async function webCryptoEncrypt(): Promise<Uint8Array> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const [userKey, keyPair] = await Promise.all([
    subtle.importKey('raw', agent.publicKey, ecdh, false, []),
    subtle.generateKey(ecdh, false, ['deriveBits']),
  ]);
  const [serverPublic, secret] = await Promise.all([
    subtle.exportKey('raw', keyPair.publicKey),
    subtle.deriveBits({ name: 'ECDH', public: userKey }, keyPair.privateKey, 256),
  ]);
  const info = new Uint8Array(144);
  info.set(utf8.encode('WebPush: info\0'));
  info.set(agent.publicKey, 14);
  info.set(new Uint8Array(serverPublic), 79);
  const ikm = await subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt: agent.auth, info },
    await subtle.importKey('raw', secret, 'HKDF', false, ['deriveBits']),
    256,
  );
  const prk = await subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  const [cek, nonce] = await Promise.all([
    subtle.deriveBits(
      { name: 'HKDF', hash: 'SHA-256', salt, info: utf8.encode('Content-Encoding: aes128gcm\0') },
      prk,
      128,
    ),
    subtle.deriveBits(
      { name: 'HKDF', hash: 'SHA-256', salt, info: utf8.encode('Content-Encoding: nonce\0') },
      prk,
      96,
    ),
  ]);
  const key = await subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const record = utf8.encode(`${payload}\x02`);
  return new Uint8Array(await subtle.encrypt({ name: 'AES-GCM', iv: nonce }, key, record));
}

const signingKey = await subtle.importKey(
  'jwk',
  {
    kty: 'EC',
    crv: 'P-256',
    x: base64url(fromBase64url(vapid.publicKey).subarray(1, 33)),
    y: base64url(fromBase64url(vapid.publicKey).subarray(33)),
    d: vapid.privateKey,
  },
  { name: 'ECDSA', namedCurve: 'P-256' },
  false,
  ['sign'],
);

async function webCryptoSign(audience: string): Promise<string> {
  const claims = { aud: audience, exp: Math.floor(Date.now() / 1000) + 43200, sub: vapid.subject };
  const input = `eyJ0eXAiOiJKV1QiLCJhbGciOiJFUzI1NiJ9.${base64url(utf8.encode(JSON.stringify(claims)))}`;
  const signature = await subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    signingKey,
    utf8.encode(input),
  );
  return `${input}.${base64url(new Uint8Array(signature))}`;
}

test(`encrypts a ${payload.length}-byte payload within 25% of direct WebCrypto calls`, async ({
  bench,
}) => {
  const result = await bench.compare(
    bench('@portable/web-push', async () => {
      await WebPush.encrypt({ subscription: agent.subscription, payload });
    }),
    bench('WebCrypto', webCryptoEncrypt),
    bench('web-push (node:crypto)', () => {
      webPush.encrypt(p256dh, auth, payload, 'aes128gcm');
    }),
  );
  expect(result.get('WebCrypto')).not.toBeFasterThan(result.get('@portable/web-push'), {
    delta: 0.25,
  });
});

test('encrypts 64 payloads at once within 25% of direct WebCrypto calls', async ({ bench }) => {
  const batch = Array.from({ length: 64 });
  const result = await bench.compare(
    bench('@portable/web-push', async () => {
      await Promise.all(
        batch.map(() => WebPush.encrypt({ subscription: agent.subscription, payload })),
      );
    }),
    bench('WebCrypto', async () => {
      await Promise.all(batch.map(webCryptoEncrypt));
    }),
    bench('web-push (node:crypto)', () => {
      for (const _ of batch) {
        webPush.encrypt(p256dh, auth, payload, 'aes128gcm');
      }
    }),
  );
  expect(result.get('WebCrypto')).not.toBeFasterThan(result.get('@portable/web-push'), {
    delta: 0.25,
  });
});

// toRequest reuses a token per push service origin for an hour, so the signing benchmark cycles
// through more origins than it keeps tokens for, and every call signs a new JWT.
const origins = Array.from({ length: 100 }, (_, i) => `https://push${i}.example.net`);
let next = 0;
let signed = 0;

test('signs a VAPID JWT within 25% of direct WebCrypto calls', async ({ bench }) => {
  const result = await bench.compare(
    bench('@portable/web-push', async () => {
      const origin = origins[signed++ % origins.length]!;
      await WebPush.toRequest({ subscription: { endpoint: `${origin}/p/1` }, vapid });
    }),
    bench('WebCrypto', async () => {
      await webCryptoSign(origins[next++ % origins.length]!);
    }),
    bench('web-push (node:crypto)', () => {
      const origin = origins[next++ % origins.length]!;
      webPush.getVapidHeaders(
        origin,
        vapid.subject,
        vapid.publicKey,
        vapid.privateKey,
        'aes128gcm',
      );
    }),
  );
  expect(result.get('WebCrypto')).not.toBeFasterThan(result.get('@portable/web-push'), {
    delta: 0.25,
  });
});

// Sending many messages to one push service, toRequest reuses its token and signs nothing.
test('builds a push request within 25% of direct WebCrypto calls', async ({ bench }) => {
  const result = await bench.compare(
    bench('@portable/web-push', async () => {
      await WebPush.toRequest({ subscription: agent.subscription, payload, vapid });
    }),
    bench('WebCrypto', async () => {
      await webCryptoEncrypt();
      await webCryptoSign(origins[next++ % origins.length]!);
    }),
    bench('web-push generateRequestDetails (node:crypto)', () => {
      webPush.generateRequestDetails(agent.subscription, payload, { vapidDetails: vapid });
    }),
  );
  expect(result.get('WebCrypto')).not.toBeFasterThan(result.get('@portable/web-push'), {
    delta: 0.25,
  });
});
