# @portable/webhooks

Verifies and signs webhooks from Standard Webhooks senders, Svix, Stripe, GitHub and Slack. Runs in browsers, Cloudflare Workers, Deno, Bun and Node 24+.

Replaces [standardwebhooks](https://www.npmjs.com/package/standardwebhooks), the `Webhook` class in [svix](https://www.npmjs.com/package/svix), Stripe's `constructEvent` and `constructEventAsync` in [stripe](https://www.npmjs.com/package/stripe), [@octokit/webhooks-methods](https://www.npmjs.com/package/@octokit/webhooks-methods) and the request verification in [@slack/bolt](https://www.npmjs.com/package/@slack/bolt).

## Why use this over the provider libraries

One package verifies all five schemes with `crypto.subtle` and no dependency for the HMAC, so you don't install the `stripe`, `svix` or `@slack/bolt` SDK for one function, and it runs in every runtime above.

- The HMAC covers the body bytes as received. Stripe and standardwebhooks decode the body as UTF-8 and encode it again, so a body with a byte order mark or invalid UTF-8 fails verification.
- The timestamp tolerance applies in both directions, and `tolerance: 0` allows no skew. Stripe and Slack accept a timestamp any distance in the future, and Stripe's `tolerance: 0` turns the check off.
- A GitHub signature needs the `sha256=` prefix and exactly 64 hex digits. The web build of `@octokit/webhooks-methods` accepts a bare signature and skips characters that aren't hex.
- Signature lengths are compared before the constant-time compare, so a truncated signature fails. Svix's Rust library let one pass (CVE-2024-21491).
- On Node, with the default WebCrypto HMAC, a verification was about 1.6× faster than Stripe's `constructEventAsync` and 1.7× faster than octokit's web build. standardwebhooks, `@slack/bolt`, Stripe's `constructEvent` and octokit's Node build were 1.8 to 7× faster. With `hmac` set to `@noble/hashes`, a Standard Webhooks verification was about 1.6× faster than standardwebhooks.

```sh
npm install @portable/webhooks
```

```ts
import * as Webhooks from '@portable/webhooks'

export default {
  async fetch(request: Request, env: { STRIPE_WEBHOOK_SECRET: string }) {
    try {
      const { body } = await Webhooks.verify(request, {
        scheme: 'stripe',
        secret: env.STRIPE_WEBHOOK_SECRET,
      })
      const event = JSON.parse(body)
      // handle event
      return new Response(null, { status: 204 })
    } catch (error) {
      if (error instanceof Webhooks.VerificationError) return new Response(null, { status: 400 })
      throw error
    }
  },
}
```

`verify` reads the raw bytes of the request body and computes the HMAC over them, so a body parser, a re-serialized JSON object or a lost byte order mark can't break the signature. It then returns the body as text for you to parse: Slack slash commands and some GitHub deliveries are form-encoded, not JSON.

In tests, `sign` returns the headers the provider would send:

```ts
const body = JSON.stringify({ id: 'evt_1', object: 'event' })
const headers = await Webhooks.sign(body, { scheme: 'stripe', secret: 'whsec_test' })
const response = await worker.fetch(new Request('https://example.com', { method: 'POST', body, headers }), env)
```

## API

| Export | Does |
| --- | --- |
| `verify(input, options)` | Checks the signature, then the timestamp, and returns `{ body, id, timestamp }`. `input` is a `Request` or `{ headers, body }`, where `headers` is a `Headers` or a plain object and `body` is the raw body as a string or `Uint8Array`. |
| `sign(body, options)` | Returns the provider's signature headers for `body` as a plain object. |
| `VerificationError` | Thrown by `verify` for a missing or malformed header, a signature that doesn't match, or a timestamp outside the tolerance. Its `reason` is `'missing-header'`, `'malformed-header'`, `'signature'` or `'timestamp'`. |

`verify` throws a `TypeError` for a mistake in the call rather than in the request: an empty secret, a Standard Webhooks secret that isn't base64, an unknown scheme, or a body that isn't a string or `Uint8Array`, such as a parsed JSON object.

The result's `id` is the delivery id from `webhook-id`, `svix-id` or `x-github-delivery`. Store it to drop a redelivered webhook, which the timestamp check can't catch inside the tolerance.

### Options

| Option | Default | Description |
| --- | --- | --- |
| `scheme` | required | `'standard'`, `'svix'`, `'stripe'`, `'github'` or `'slack'`. |
| `secret` | required | The signing secret, as a string or raw key bytes. Pass an array while rotating secrets; `verify` accepts a signature from any of them, and `sign` takes one. |
| `tolerance` | `300` | `verify` only. Largest difference between the signed timestamp and `now`, in seconds, in either direction. `Infinity` turns the check off. GitHub signs no timestamp. |
| `now` | `new Date()` | `verify` only. The time to compare the signed timestamp with. |
| `timestamp` | `new Date()` | `sign` only. The time to sign. |
| `id` | random `msg_` id | `sign` only. The delivery id for Standard Webhooks and Svix, and the `x-github-delivery` header for GitHub. |
| `hmac` | `crypto.subtle` | A function `(key, data) => Uint8Array \| Promise<Uint8Array>` that computes HMAC-SHA256. |

### Schemes

| Scheme | Headers | Signed content | Secret |
| --- | --- | --- | --- |
| `standard` | `webhook-id`, `webhook-timestamp`, `webhook-signature` | `{id}.{timestamp}.{body}` | base64, `whsec_` prefix optional |
| `svix` | `svix-*`, falling back to `webhook-*` | as `standard` | as `standard` |
| `stripe` | `stripe-signature: t=…,v1=…` | `{timestamp}.{body}` | UTF-8 text, `whsec_` prefix included |
| `github` | `x-hub-signature-256: sha256=…` | `{body}` | UTF-8 text |
| `slack` | `x-slack-request-timestamp`, `x-slack-signature: v0=…` | `v0:{timestamp}:{body}` | UTF-8 text |

A header may carry several signatures (Standard Webhooks separates them with spaces, Stripe repeats `v1=`), and one match is enough. Standard Webhooks `v1a` (ed25519) signatures and GitHub's SHA-1 `x-hub-signature` header are ignored.

## Crypto

`verify` and `sign` compute HMAC-SHA256 with `crypto.subtle`, which every supported runtime has, so the package has no dependency for it. WebCrypto is async, but `verify` already has to await the request body. Imported keys are cached for up to 16 secrets, because `importKey` takes about two thirds of each HMAC on Node and half in Chromium, and the cache made a verification about 2.9× faster on Node.

On Node, WebCrypto's HMAC is about 7× slower than `@noble/hashes`. To verify many webhooks on Node, install `@noble/hashes` and pass it as `hmac`:

```ts
import { hmac } from '@noble/hashes/hmac.js'
import { sha256 } from '@noble/hashes/sha2.js'
import * as Webhooks from '@portable/webhooks'

const { body } = await Webhooks.verify(request, {
  scheme: 'github',
  secret,
  hmac: (key, data) => hmac(sha256, key, data),
})
```

## Migrating

| Upstream | @portable/webhooks |
| --- | --- |
| `new Webhook(secret).verify(payload, headers)` (standardwebhooks) | `JSON.parse((await Webhooks.verify({ headers, body: payload }, { scheme: 'standard', secret })).body)` |
| `new Webhook(secret).verify(payload, headers)` (svix) | `await Webhooks.verify({ headers, body: payload }, { scheme: 'svix', secret })` |
| `new Webhook(secret).sign(id, date, payload)` | `(await Webhooks.sign(payload, { scheme: 'standard', secret, id, timestamp: date }))['webhook-signature']` |
| `new Webhook(bytes, { format: 'raw' })` | `secret: bytes` |
| `stripe.webhooks.constructEvent(body, signature, secret, tolerance)` | `JSON.parse((await Webhooks.verify(request, { scheme: 'stripe', secret, tolerance })).body)` |
| `constructEvent(…, tolerance = 0)` | `tolerance: Infinity` |
| `constructEvent(…, receivedAt)` | `now: new Date(receivedAt)` |
| `stripe.webhooks.generateTestHeaderString({ payload, secret, timestamp })` | `(await Webhooks.sign(payload, { scheme: 'stripe', secret, timestamp: new Date(timestamp * 1000) }))['stripe-signature']` |
| `await verify(secret, payload, signature)` (octokit) | `await Webhooks.verify(request, { scheme: 'github', secret })`, which throws instead of returning `false` |
| `await verifyWithFallback(secret, payload, signature, others)` | `secret: [secret, ...others]` |
| `await sign(secret, payload)` (octokit) | `(await Webhooks.sign(payload, { scheme: 'github', secret }))['x-hub-signature-256']` |
| `verifySlackRequest({ signingSecret, body, headers })` | `await Webhooks.verify(request, { scheme: 'slack', secret: signingSecret })` |
| `isValidSlackRequest(…)` | `verify(…).then(() => true, () => false)` |

These behaviors differ from upstream:

- The timestamp check applies in both directions. Stripe and Slack accept a timestamp any distance in the future, so a clock that runs fast on either side goes unnoticed and a captured request stays valid until its time passes.
- Stripe's `tolerance: 0` turns the check off. Here `0` requires the exact second, and `Infinity` turns it off.
- The HMAC is computed over the body bytes as received. Stripe and standardwebhooks decode bytes as UTF-8 and encode them again, which drops a byte order mark and replaces invalid sequences, so those bodies fail upstream.
- A timestamp must be an integer number of seconds. standardwebhooks and Stripe read `123abc` as `123` with `parseInt`.
- GitHub signatures need the `sha256=` prefix and exactly 64 hex digits. The web build of `@octokit/webhooks-methods` accepts a signature without the prefix, skips characters that aren't hex, and throws a `TypeError` when it finds no hex at all.
- Stripe and standardwebhooks parse JSON for you. `verify` returns the text, because Slack and GitHub can send form-encoded bodies.
- Stripe's thin events (`v2.core.event`) are not rejected; `verify` doesn't look inside the body.
