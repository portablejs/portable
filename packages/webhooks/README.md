# @portable/webhooks

Verifies and signs webhooks from Standard Webhooks senders (Svix, Resend, Clerk and others), Stripe, GitHub and Slack, and from any other sender that signs with HMAC-SHA256 once you describe its headers. Runs in browsers, Cloudflare Workers, Deno, Bun and Node 24+.

Replaces [standardwebhooks](https://www.npmjs.com/package/standardwebhooks), the `Webhook` class in [svix](https://www.npmjs.com/package/svix), Stripe's `constructEvent` and `constructEventAsync` in [stripe](https://www.npmjs.com/package/stripe), [@octokit/webhooks-methods](https://www.npmjs.com/package/@octokit/webhooks-methods) and the request verification in [@slack/bolt](https://www.npmjs.com/package/@slack/bolt).

```sh
npm install @portable/webhooks
```

```ts
import * as Webhooks from '@portable/webhooks'

export default {
  async fetch(request: Request, env: { STRIPE_WEBHOOK_SECRET: string }) {
    try {
      const { body } = await Webhooks.verify(request, {
        scheme: Webhooks.stripe,
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
const headers = await Webhooks.sign(body, { scheme: Webhooks.stripe, secret: 'whsec_test' })
const response = await worker.fetch(new Request('https://example.com', { method: 'POST', body, headers }), env)
```

## API

| Export | Does |
| --- | --- |
| `verify(input, options)` | Checks the signature, then the timestamp, and returns `{ body, id, timestamp }`. `input` is a `Request` or `{ headers, body }`, where `headers` is a `Headers` or a plain object and `body` is the raw body as a string or `Uint8Array`. |
| `sign(body, options)` | Returns the provider's signature headers for `body` as a plain object. |
| `standard`, `stripe`, `github`, `slack` | The schemes this package ships, passed as `scheme`. |
| `Scheme` | The type of a scheme object, for writing one for another sender. |
| `VerificationError` | Thrown by `verify` for a missing or malformed header, a signature that doesn't match, or a timestamp outside the tolerance. Its `code` is `'missing-header'`, `'malformed-header'`, `'signature'` or `'timestamp'`. |

`verify` throws a `TypeError` or `RangeError` for a mistake in the call rather than in the request. An empty secret or a Standard Webhooks secret that isn't base64 throws a `RangeError`. A `scheme` that isn't a scheme object, or a body that isn't a string or `Uint8Array`, such as a parsed JSON object, throws a `TypeError`.

The result's `id` is the delivery id from `webhook-id`, `svix-id` or `x-github-delivery`. Store it to drop a redelivered webhook, which the timestamp check can't catch inside the tolerance.

### Options

| Option | Default | Description |
| --- | --- | --- |
| `scheme` | `Webhooks.standard` | `Webhooks.standard`, `Webhooks.stripe`, `Webhooks.github`, `Webhooks.slack`, or a scheme you write. |
| `secret` | required | The signing secret, as a string or raw key bytes. Pass an array while rotating secrets. `verify` accepts a signature from any of them, and `sign` takes one. |
| `tolerance` | `300_000` | `verify` only. Largest difference between the signed timestamp and `now`, in milliseconds, in either direction. `Infinity` turns the check off. GitHub signs no timestamp. |
| `now` | `new Date()` | In `verify`, the time to compare the signed timestamp with. In `sign`, the time to sign. |
| `id` | `crypto.randomUUID()` | `sign` only. The delivery id for Standard Webhooks, and the `x-github-delivery` header for GitHub. |
| `hmac` | `crypto.subtle` | A function `(hash, key, data) => Uint8Array \| Promise<Uint8Array>` that computes an HMAC. Webhooks calls it with `'SHA-256'`. |
| `signal` | none | Aborting rejects with `signal.reason`, and cancels a `Request` body that is still being read. Firefox has no `Request.prototype.body`, so there the body is read whole and isn't cancelled. |

### Schemes

| Scheme | Headers | Signed content | Secret |
| --- | --- | --- | --- |
| `standard` | `webhook-id`, `webhook-timestamp`, `webhook-signature`, or the `svix-` headers when those are missing | `{id}.{timestamp}.{body}` | base64, `whsec_` prefix optional |
| `stripe` | `stripe-signature: t=…,v1=…` | `{timestamp}.{body}` | UTF-8 text, `whsec_` prefix included |
| `github` | `x-hub-signature-256: sha256=…` | `{body}` | UTF-8 text |
| `slack` | `x-slack-request-timestamp`, `x-slack-signature: v0=…` | `v0:{timestamp}:{body}` | UTF-8 text |

A header may carry several signatures (Standard Webhooks separates them with spaces, Stripe repeats `v1=`), and one match is enough. Standard Webhooks `v1a` (ed25519) signatures and GitHub's SHA-1 `x-hub-signature` header are ignored.

### Other senders

A scheme is an object of plain functions: `parse` reads the signatures (as bytes), timestamp and id from the headers, `payload` returns what the sender signs, `headers` writes the headers for `sign`, and the optional `key` turns a string secret into key bytes. `verify` and `sign` do everything else the same way for every scheme: the HMAC, the length check and constant-time compare, several secrets and the timestamp tolerance. For a sender that signs with HMAC-SHA256, write its scheme:

```ts
import * as Webhooks from '@portable/webhooks'

const utf8 = new TextEncoder()
const seconds = (date: Date) => String(Math.floor(date.getTime() / 1000))
const toHex = (bytes: Uint8Array) =>
  Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')

// Acme sends `acme-timestamp: <seconds>` and `acme-signature: <hex>`, the HMAC-SHA256 of
// `{timestamp}.{body}`.
const acme: Webhooks.Scheme = {
  parse(headers) {
    const signature = headers.get('acme-signature')
    const timestamp = headers.get('acme-timestamp')
    if (!signature || !timestamp)
      throw new Webhooks.VerificationError({ code: 'missing-header', message: 'Missing Acme headers' })
    if (!/^[\da-f]{64}$/.test(signature) || !/^\d+$/.test(timestamp))
      throw new Webhooks.VerificationError({ code: 'malformed-header', message: 'Malformed Acme headers' })
    return {
      signatures: [Uint8Array.from(signature.match(/../g)!, (byte) => parseInt(byte, 16))],
      timestamp: new Date(Number(timestamp) * 1000),
    }
  },
  payload: ({ timestamp, body }) =>
    new Uint8Array([...utf8.encode(`${seconds(timestamp!)}.`), ...body]),
  headers: ({ signature, timestamp }) => ({
    'acme-timestamp': seconds(timestamp),
    'acme-signature': toHex(signature),
  }),
}

const { body } = await Webhooks.verify(request, { scheme: acme, secret: env.ACME_SECRET })
```

This package won't add schemes beyond these four. The built-in ones in [`src/schemes.ts`](src/schemes.ts) are written the same way.

## Crypto

`verify` and `sign` compute HMAC-SHA256 with `crypto.subtle`, which every supported runtime has, so the package has no dependency for it. WebCrypto is async, but `verify` already has to await the request body. Imported keys are cached for up to 16 secrets, because `importKey` takes about two thirds of each HMAC on Node and half in Chromium, and the cache made a verification about 2.9× faster on Node.

On Node, WebCrypto's HMAC is about 7× slower than `@noble/hashes`. To verify many webhooks on Node, install `@noble/hashes` and pass it as `hmac`:

```ts
import { hmac } from '@noble/hashes/hmac.js'
import { sha256 } from '@noble/hashes/sha2.js'
import * as Webhooks from '@portable/webhooks'

const { body } = await Webhooks.verify(request, {
  scheme: Webhooks.github,
  secret,
  hmac: (_hash, key, data) => hmac(sha256, key, data),
})
```

## Types

| Type | Description |
| --- | --- |
| `Webhooks.Hmac` | The `hmac` option: `(hash, key, data) => Uint8Array \| Promise<Uint8Array>`, re-exported from `@portable/web-crypto`. See [Crypto](#crypto). |
| `Webhooks.VerificationError.Code` | `VerificationError.code`: `'missing-header'`, `'malformed-header'`, `'signature'` or `'timestamp'`. |

## Why use this over the provider libraries

One package verifies all four schemes, and any other HMAC-SHA256 sender through a scheme object. It computes the HMAC with `crypto.subtle` and no dependency, so you don't install the `stripe`, `svix` or `@slack/bolt` SDK for one function, and it runs in any JavaScript runtime.

- The HMAC covers the body bytes as received. Stripe and standardwebhooks decode the body as UTF-8 and encode it again, so a body with a byte order mark or invalid UTF-8 fails verification.
- The timestamp tolerance applies in both directions, and `tolerance: 0` allows no skew. Stripe and Slack accept a timestamp any distance in the future, and Stripe's `tolerance: 0` turns the check off.
- A GitHub signature needs the `sha256=` prefix and exactly 64 hex digits. The web build of `@octokit/webhooks-methods` accepts a bare signature and skips characters that aren't hex.
- Signature lengths are compared before the constant-time compare, so a truncated signature fails. Svix's Rust library let one pass (CVE-2024-21491).

### Performance

<!-- bench:start -->
| | @portable/webhooks | @portable/webhooks with @noble/hashes | standardwebhooks | svix | stripe, `constructEventAsync` | stripe, `constructEvent` | @octokit/webhooks-methods, web build | @octokit/webhooks-methods, Node build | @slack/bolt | `crypto.subtle` by hand | `node:crypto` by hand |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Verify a Standard Webhook | 17,900 | 59,300 | 47,400 | 59,200 | – | – | – | – | – | – | – |
| Verify a Stripe webhook | 17,500 | 55,800 | – | – | 13,500 | 102,000 | – | – | – | – | – |
| Verify a GitHub webhook | 19,300 | 67,700 | – | – | – | – | 16,800 | 232,000 | – | – | 240,000 |
| Verify a Slack request | 19,100 | 60,700 | – | – | – | – | – | – | 87,400 | 19,000 | – |

Operations per second from `pnpm bench`, higher is better, in Node 24.22.0, on Intel(R) Xeon(R) Processor @ 2.10GHz (4 cores). A dash means the library has no equivalent.

| | @portable/webhooks | @portable/webhooks with @noble/hashes | standardwebhooks | svix | stripe, `constructEventAsync` | stripe, `constructEvent` | @octokit/webhooks-methods, web build | @octokit/webhooks-methods, Node build | @slack/bolt | `crypto.subtle` by hand | `node:crypto` by hand |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Minified and gzipped | 4.5 kB | 7.4 kB | 4.6 kB | 4.5 kB | 30 kB | 30 kB | 0.4 kB | 0.4 kB | 1.3 kB | built in | built in |
| Runtime dependencies | 2 | 3 | 2 | 3 | 0 | 0 | 0 | 0 | 98 | – | – |
| Node built-ins used | none | none | `Buffer` | `Buffer` | `Buffer` | `Buffer` | none | none | `crypto` | none | Node only |
| TypeScript types | included | included | included | included | included | included | included | included | included | – | – |
| Version compared | – | – | 1.1.1 | 2.8.0 | 23.0.0 | 23.0.0 | 6.0.0 | 6.0.0 | 5.1.0 | – | – |

Sizes cover the imports in the usage example, or the equivalent imports of each library, bundled for the browser by `scripts/bundle-size.ts`. Runtime dependencies count every package installed with the published package. A library that uses Node built-ins needs polyfills in a browser and the `nodejs_compat` flag in Cloudflare Workers.
<!-- bench:end -->

On Node, WebCrypto's HMAC is several times slower than a JavaScript one, so pass `@noble/hashes` as `hmac` there if verification speed matters. Browsers and Workers have fast WebCrypto, so the default is fine.

## Migrating

| Upstream | @portable/webhooks |
| --- | --- |
| `new Webhook(secret).verify(payload, headers)` (standardwebhooks) | `JSON.parse((await Webhooks.verify({ headers, body: payload }, { secret })).body)` |
| `new Webhook(secret).verify(payload, headers)` (svix) | `await Webhooks.verify({ headers, body: payload }, { secret })` |
| `new Webhook(secret).sign(id, date, payload)` | `(await Webhooks.sign(payload, { secret, id, now: date }))['webhook-signature']` |
| `new Webhook(bytes, { format: 'raw' })` | `secret: bytes` |
| `stripe.webhooks.constructEvent(body, signature, secret, tolerance)` | `JSON.parse((await Webhooks.verify(request, { scheme: Webhooks.stripe, secret, tolerance: tolerance * 1000 })).body)` |
| `constructEvent(…, tolerance = 0)` | `tolerance: Infinity` |
| `constructEvent(…, receivedAt)` | `now: new Date(receivedAt)` |
| `stripe.webhooks.generateTestHeaderString({ payload, secret, timestamp })` | `(await Webhooks.sign(payload, { scheme: Webhooks.stripe, secret, timestamp: new Date(timestamp * 1000) }))['stripe-signature']` |
| `await verify(secret, payload, signature)` (octokit) | `await Webhooks.verify(request, { scheme: Webhooks.github, secret })`, which throws instead of returning `false` |
| `await verifyWithFallback(secret, payload, signature, others)` | `secret: [secret, ...others]` |
| `await sign(secret, payload)` (octokit) | `(await Webhooks.sign(payload, { scheme: Webhooks.github, secret }))['x-hub-signature-256']` |
| `verifySlackRequest({ signingSecret, body, headers })` | `await Webhooks.verify(request, { scheme: Webhooks.slack, secret: signingSecret })` |
| `isValidSlackRequest(…)` | `verify(…).then(() => true, () => false)` |

These behaviors differ from upstream:

- The timestamp check applies in both directions. Stripe and Slack accept a timestamp any distance in the future, so a clock that runs fast on either side goes unnoticed and a captured request stays valid until its time passes.
- Stripe's `tolerance: 0` turns the check off. Here `0` requires the exact second, and `Infinity` turns it off.
- The HMAC is computed over the body bytes as received. Stripe and standardwebhooks decode bytes as UTF-8 and encode them again, which drops a byte order mark and replaces invalid sequences, so those bodies fail upstream.
- A timestamp must be an integer number of seconds. standardwebhooks and Stripe read `123abc` as `123` with `parseInt`.
- GitHub signatures need the `sha256=` prefix and exactly 64 hex digits. The web build of `@octokit/webhooks-methods` accepts a signature without the prefix, skips characters that aren't hex, and throws a `TypeError` when it finds no hex at all.
- Stripe and standardwebhooks parse JSON for you. `verify` returns the text, because Slack and GitHub can send form-encoded bodies.
- `verify` doesn't reject Stripe's thin events (`v2.core.event`), because it doesn't look inside the body.
