import { createHmac } from 'node:crypto';
import { hmac } from '@noble/hashes/hmac.js';
import { sha1 } from '@noble/hashes/legacy.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { OAuth as NodeOAuth } from 'oauth';
import OAuth from 'oauth-1.0a';
import { expect, test } from 'vite-plus/test';
import * as OAuth1 from '@portable/oauth1';
import { twitter } from './utils.js';

const url =
  'https://api.twitter.com/1.1/statuses/user_timeline.json?count=5&screen_name=twitterapi';
const status = 'Hello Ladies + Gentlemen, a signed OAuth request!';
const updateUrl = 'https://api.twitter.com/1/statuses/update.json?include_entities=true';

const oauth1a = new OAuth({
  consumer: twitter.consumer,
  signature_method: 'HMAC-SHA1',
  hash_function: (base, key) => createHmac('sha1', key).update(base).digest('base64'),
});
const nodeOAuth = new NodeOAuth(
  null,
  null,
  twitter.consumer.key,
  twitter.consumer.secret,
  '1.0',
  null,
  'HMAC-SHA1',
);
const nodeHmac = ((algorithm, key, data) =>
  createHmac(algorithm === 'SHA-1' ? 'sha1' : 'sha256', key)
    .update(data)
    .digest()) satisfies OAuth1.Hmac;
const nobleHmac = ((algorithm, key, data) =>
  hmac(algorithm === 'SHA-1' ? sha1 : sha256, key, data)) satisfies OAuth1.Hmac;

// oauth-1.0a is given node:crypto's HMAC, and Node's WebCrypto HMAC is several times slower than
// a JavaScript one, so the assertions compare it with `hmac` set to @noble/hashes. The WebCrypto
// default is measured for reference.

test('Authorization header for a GET request within 25% of oauth-1.0a', async ({ bench }) => {
  const result = await bench.compare(
    bench('@portable/oauth1', async () => {
      await OAuth1.authorization(new Request(url), twitter);
    }),
    bench('@portable/oauth1 with @noble/hashes', async () => {
      await OAuth1.authorization(new Request(url), { ...twitter, hmac: nobleHmac });
    }),
    bench('oauth-1.0a', () => {
      oauth1a.toHeader(oauth1a.authorize({ url, method: 'GET' }, twitter.token));
    }),
    bench('oauth (node-oauth)', () => {
      nodeOAuth.authHeader(url, twitter.token.key, twitter.token.secret, 'GET');
    }),
  );
  expect(result.get('oauth-1.0a')).not.toBeFasterThan(
    result.get('@portable/oauth1 with @noble/hashes'),
    { delta: 0.25 },
  );
});

// sign() reads the body and builds a second Request, which costs about 10 µs in undici. Hashing is
// not the gap: a node:crypto HMAC measures the same as @noble/hashes.
test('signed form POST within 50% of oauth-1.0a', async ({ bench }) => {
  const result = await bench.compare(
    bench('@portable/oauth1', async () => {
      await OAuth1.sign(
        new Request(updateUrl, { method: 'POST', body: new URLSearchParams({ status }) }),
        twitter,
      );
    }),
    bench('@portable/oauth1 with @noble/hashes', async () => {
      await OAuth1.sign(
        new Request(updateUrl, { method: 'POST', body: new URLSearchParams({ status }) }),
        { ...twitter, hmac: nobleHmac },
      );
    }),
    bench('oauth-1.0a', () => {
      const header = oauth1a.toHeader(
        oauth1a.authorize({ url: updateUrl, method: 'POST', data: { status } }, twitter.token),
      );
      new Request(updateUrl, {
        method: 'POST',
        body: new URLSearchParams({ status }),
        headers: { ...header },
      });
    }),
    bench('@portable/oauth1 with node:crypto hmac', async () => {
      await OAuth1.sign(
        new Request(updateUrl, { method: 'POST', body: new URLSearchParams({ status }) }),
        {
          ...twitter,
          hmac: nodeHmac,
        },
      );
    }),
  );
  expect(result.get('oauth-1.0a')).not.toBeFasterThan(
    result.get('@portable/oauth1 with @noble/hashes'),
    { delta: 0.5 },
  );
});
