import { createHmac, timingSafeEqual } from 'node:crypto'
import { hmac } from '@noble/hashes/hmac.js'
import { sha256 } from '@noble/hashes/sha2.js'
import { verify as octokitVerify } from '@octokit/webhooks-methods'
import { verifySlackRequest } from '@slack/bolt/dist/receivers/verify-request.js'
import { Webhook as StandardWebhook } from 'standardwebhooks'
import Stripe from 'stripe'
import { expect, test } from 'vite-plus/test'
import * as Core from '../core.js'
import * as Webhooks from '../index.js'
import { octokitWeb } from './octokit-web.js'

// The libraries that hash with node:crypto's synchronous C++ HMAC are 3 to 8 times faster on Node
// than WebCrypto or JavaScript HMAC, so they are measured for reference only. The 25% assertions
// compare against libraries and native calls that use WebCrypto or a JavaScript HMAC.

const stripe = new Stripe('sk_test_bench')
const secret = 'whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw'
const body = JSON.stringify({
  id: 'evt_1',
  object: 'event',
  data: { object: { items: Array.from({ length: 20 }, (_, i) => ({ id: i, name: `item ${i}` })) } },
})
const bytes = new TextEncoder().encode(body)
const nobleHmac: Core.Hmac = (key, data) => hmac(sha256, key, data)

async function headers(scheme: Webhooks.Scheme): Promise<Record<string, string>> {
  return Webhooks.sign(body, { scheme, secret })
}

test(`verifies a ${body.length}-byte Standard Webhook within 25% of standardwebhooks`, async ({
  bench,
}) => {
  const signed = await headers('standard')
  const upstream = new StandardWebhook(secret)
  const result = await bench.compare(
    bench('@portable/webhooks', async () => {
      await Webhooks.verify({ headers: signed, body }, { scheme: 'standard', secret })
    }),
    bench('@portable/webhooks/core with @noble/hashes', async () => {
      await Core.verify({ headers: signed, body }, { scheme: 'standard', secret, hmac: nobleHmac })
    }),
    bench('standardwebhooks', () => {
      upstream.verify(body, signed)
    }),
  )
  expect(result.get('standardwebhooks')).not.toBeFasterThan(
    result.get('@portable/webhooks/core with @noble/hashes'),
    { delta: 0.25 },
  )
  expect(result.get('standardwebhooks')).not.toBeFasterThan(result.get('@portable/webhooks'), {
    delta: 0.25,
  })
})

test('verifies a Stripe webhook within 25% of constructEventAsync', async ({ bench }) => {
  const signature = (await headers('stripe'))['stripe-signature']!
  const subtle = Stripe.createSubtleCryptoProvider()
  const result = await bench.compare(
    bench('@portable/webhooks', async () => {
      await Webhooks.verify(
        { headers: { 'stripe-signature': signature }, body },
        { scheme: 'stripe', secret },
      )
    }),
    bench('stripe constructEventAsync with WebCrypto', async () => {
      await stripe.webhooks.constructEventAsync(body, signature, secret, undefined, subtle)
    }),
    bench('stripe constructEvent with node:crypto', () => {
      stripe.webhooks.constructEvent(body, signature, secret)
    }),
  )
  expect(result.get('stripe constructEventAsync with WebCrypto')).not.toBeFasterThan(
    result.get('@portable/webhooks'),
    { delta: 0.25 },
  )
})

test('verifies a GitHub webhook within 25% of @octokit/webhooks-methods for the web', async ({
  bench,
}) => {
  const signed = await headers('github')
  const signature = signed['x-hub-signature-256']!
  const result = await bench.compare(
    bench('@portable/webhooks', async () => {
      await Webhooks.verify({ headers: signed, body }, { scheme: 'github', secret })
    }),
    bench('@octokit/webhooks-methods for the web', async () => {
      await octokitWeb.verify(secret, body, signature)
    }),
    bench('@octokit/webhooks-methods for Node', async () => {
      await octokitVerify(secret, body, signature)
    }),
    bench('node:crypto createHmac', () => {
      const expected = Buffer.from(
        `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`,
      )
      timingSafeEqual(expected, Buffer.from(signature))
    }),
  )
  expect(result.get('@octokit/webhooks-methods for the web')).not.toBeFasterThan(
    result.get('@portable/webhooks'),
    { delta: 0.25 },
  )
})

test('verifies a Slack request within 25% of WebCrypto importKey and verify', async ({ bench }) => {
  const signed = await headers('slack')
  const timestamp = signed['x-slack-request-timestamp']!
  const signature = Uint8Array.from(Buffer.from(signed['x-slack-signature']!.slice(3), 'hex'))
  const key = new TextEncoder().encode(secret)
  const result = await bench.compare(
    bench('@portable/webhooks', async () => {
      await Webhooks.verify({ headers: signed, body }, { scheme: 'slack', secret })
    }),
    bench('crypto.subtle importKey and verify', async () => {
      const cryptoKey = await crypto.subtle.importKey(
        'raw',
        key,
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['verify'],
      )
      const data = Buffer.concat([Buffer.from(`v0:${timestamp}:`), bytes])
      await crypto.subtle.verify('HMAC', cryptoKey, signature, data)
    }),
    bench('@slack/bolt verifySlackRequest', () => {
      verifySlackRequest({
        signingSecret: secret,
        body,
        headers: {
          'x-slack-signature': signed['x-slack-signature']!,
          'x-slack-request-timestamp': Number(timestamp),
        },
      })
    }),
  )
  expect(result.get('crypto.subtle importKey and verify')).not.toBeFasterThan(
    result.get('@portable/webhooks'),
    { delta: 0.25 },
  )
})
