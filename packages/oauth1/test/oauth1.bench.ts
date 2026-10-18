import { createHash, createHmac } from 'node:crypto'
import { OAuth as NodeOAuth } from 'oauth'
import OAuth from 'oauth-1.0a'
import { expect, test } from 'vite-plus/test'
import * as Core from '@portable/oauth1/core'
import * as OAuth1 from '@portable/oauth1'
import { twitter } from './utils.js'

const url = 'https://api.twitter.com/1.1/statuses/user_timeline.json?count=5&screen_name=twitterapi'
const status = 'Hello Ladies + Gentlemen, a signed OAuth request!'
const updateUrl = 'https://api.twitter.com/1/statuses/update.json?include_entities=true'

const oauth1a = new OAuth({
  consumer: twitter.consumer,
  signature_method: 'HMAC-SHA1',
  hash_function: (base, key) => createHmac('sha1', key).update(base).digest('base64'),
})
const nodeOAuth = new NodeOAuth(
  null,
  null,
  twitter.consumer.key,
  twitter.consumer.secret,
  '1.0',
  null,
  'HMAC-SHA1',
)
const nodeDigest: Core.Digest = (algorithm, data) =>
  createHash(algorithm === 'SHA-1' ? 'sha1' : 'sha256')
    .update(data)
    .digest()
const webCrypto: Core.Digest = async (algorithm, data) =>
  new Uint8Array(await crypto.subtle.digest(algorithm, data as Uint8Array<ArrayBuffer>))

test('Authorization header for a GET request within 25% of oauth-1.0a', async ({ bench }) => {
  const result = await bench.compare(
    bench('@portable/oauth1', async () => {
      await OAuth1.authorization(new Request(url), twitter)
    }),
    bench('oauth-1.0a', () => {
      oauth1a.toHeader(oauth1a.authorize({ url, method: 'GET' }, twitter.token))
    }),
    bench('oauth (node-oauth)', () => {
      nodeOAuth.authHeader(url, twitter.token.key, twitter.token.secret, 'GET')
    }),
    bench('@portable/oauth1/core with crypto.subtle.digest', async () => {
      await Core.authorization(new Request(url), { ...twitter, digest: webCrypto })
    }),
  )
  expect(result.get('oauth-1.0a')).not.toBeFasterThan(result.get('@portable/oauth1'), {
    delta: 0.25,
  })
})

// sign() reads the body and builds a second Request, which costs about 10 µs in undici. Hashing is
// not the gap: a node:crypto digest measures the same as @noble/hashes.
test('signed form POST within 50% of oauth-1.0a', async ({ bench }) => {
  const result = await bench.compare(
    bench('@portable/oauth1', async () => {
      await OAuth1.sign(
        new Request(updateUrl, { method: 'POST', body: new URLSearchParams({ status }) }),
        twitter,
      )
    }),
    bench('oauth-1.0a', () => {
      const header = oauth1a.toHeader(
        oauth1a.authorize({ url: updateUrl, method: 'POST', data: { status } }, twitter.token),
      )
      new Request(updateUrl, {
        method: 'POST',
        body: new URLSearchParams({ status }),
        headers: { ...header },
      })
    }),
    bench('@portable/oauth1/core with node:crypto digest', async () => {
      await Core.sign(
        new Request(updateUrl, { method: 'POST', body: new URLSearchParams({ status }) }),
        {
          ...twitter,
          digest: nodeDigest,
        },
      )
    }),
  )
  expect(result.get('oauth-1.0a')).not.toBeFasterThan(result.get('@portable/oauth1'), {
    delta: 0.5,
  })
})
