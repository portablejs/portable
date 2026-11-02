# @portable/webhooks

This package verifies webhook data from APIs like Stripe, GitHub, Slack, and every Standard Webhooks sender (e.g. Resend, Clerk). Runs in browsers, Cloudflare Workers, Node 24+, Bun, and Deno.

`verify` works with raw request bodies and proves the data is exactly as sent using HMAC signatures.

Replaces [standardwebhooks](https://www.npmjs.com/package/standardwebhooks), the `Webhook` class in [svix](https://www.npmjs.com/package/svix), Stripe's `constructEvent` (and `constructEventAsync`) in [stripe](https://www.npmjs.com/package/stripe), [@octokit/webhooks-methods](https://www.npmjs.com/package/@octokit/webhooks-methods), and the request verification in [@slack/bolt](https://www.npmjs.com/package/@slack/bolt).

```sh
npm install @portable/webhooks
```

```ts
import * as Webhooks from '@portable/webhooks';

export default {
  async fetch(request: Request, env: { STRIPE_WEBHOOK_SECRET: string }) {
    try {
      const { body } = await Webhooks.verify(request, {
        scheme: Webhooks.stripe,
        secret: env.STRIPE_WEBHOOK_SECRET,
      });
      const event = JSON.parse(body);
      // handle event
      return new Response(null, { status: 204 });
    } catch (error) {
      if (error instanceof Webhooks.VerificationError) {
        return new Response(null, { status: 400 });
      }
      throw error;
    }
  },
};
```

`verify` computes the HMAC over the raw body bytes, so a body parser or re-serialized JSON can't break the signature. It returns the body as text, because Slack slash commands and some GitHub deliveries are form-encoded, not JSON.

In tests, `sign` returns the headers the provider would send:

```ts
const body = JSON.stringify({ id: 'evt_1', object: 'event' });
const headers = await Webhooks.sign(body, { scheme: Webhooks.stripe, secret: 'whsec_test' });
const response = await worker.fetch(new Request('https://example.com', { method: 'POST', body, headers }), env);
```

## API

| Export | Does |
| --- | --- |
| `verify(input, options)` | Checks the signature and timestamp, and returns `{ body, id, timestamp }`. `input` is a `Request` or `{ headers, body }`, with `headers` as `Headers` or a plain object and the raw `body` as a string or `Uint8Array`. |
| `sign(body, options)` | Returns the provider's signature headers for `body` as a plain object, for tests or to send Standard Webhooks. Pass the same `id` when you retry a delivery. |
| `standard`, `stripe`, `github`, `slack` | The built-in schemes, passed as `scheme`. |
| `Scheme` | The type of a scheme object, for writing your own. |
| `VerificationError` | Thrown by `verify` for a missing or malformed header, a wrong signature, or a timestamp outside the tolerance. Its `code` is `'missing-header'`, `'malformed-header'`, `'signature'`, or `'timestamp'`. |
| `MaxBytesError` | Thrown by `verify` when a `Request` body is longer than `maxBytes`, which it stores. |

Mistakes in the call throw a `RangeError` or `TypeError`, not `VerificationError`:

- `RangeError`: an empty secret or `secret` array, a Standard Webhooks secret that isn't base64, an invalid `now`, or a negative `tolerance` or `maxBytes`.
- `TypeError`: a `scheme` that isn't a scheme object, or a body that isn't a string or `Uint8Array`, such as parsed JSON.

The result's `id` comes from `webhook-id`, `svix-id`, or `x-github-delivery`. Store it to drop redelivered webhooks, since the timestamp check can't catch them within the tolerance.

### Options

| Option | Default | Description |
| --- | --- | --- |
| `scheme` | `Webhooks.standard` | `Webhooks.standard`, `Webhooks.stripe`, `Webhooks.github`, `Webhooks.slack`, or a scheme you write. |
| `secret` | required | The signing secret, as a string or raw key bytes. While rotating secrets, pass an array to `verify`, which accepts a signature from any of them. `sign` takes one. |
| `tolerance` | `300_000` | `verify` only. Largest difference in ms between the signed timestamp and `now`, in either direction. `Infinity` turns the check off. GitHub signs no timestamp. |
| `maxBytes` | `Infinity` | `verify` only. The longest `Request` body to read. A longer body is cancelled and throws `MaxBytesError`. Set it for requests from the internet. |
| `now` | `new Date()` | The time to check against in `verify`, or to sign at in `sign`, as a `Date` or a `Temporal.Instant`. |
| `id` | `crypto.randomUUID()` | `sign` only. The delivery id for Standard Webhooks, and the `x-github-delivery` header for GitHub. |
| `hmac` | `WebCrypto.hmac` | A function `(hash, key, data) => Uint8Array \| Promise<Uint8Array>`, called with `'SHA-256'`. |
| `signal` | none | Aborting rejects with `signal.reason` and cancels a `Request` body still being read. In Firefox, the body is read whole and isn't cancelled. |

### Schemes

| Scheme | Headers | Signed content | Secret |
| --- | --- | --- | --- |
| `standard` | `webhook-id`, `webhook-timestamp`, `webhook-signature`, or the `svix-` headers when those are missing | `{id}.{timestamp}.{body}` | base64, `whsec_` prefix optional |
| `stripe` | `stripe-signature: t=…,v1=…` | `{timestamp}.{body}` | UTF-8 text, `whsec_` prefix included |
| `github` | `x-hub-signature-256: sha256=…` | `{body}` | UTF-8 text |
| `slack` | `x-slack-request-timestamp`, `x-slack-signature: v0=…` | `v0:{timestamp}:{body}` | UTF-8 text |

If a header has several signatures, one match is enough. Standard Webhooks `v1a` (ed25519) signatures and GitHub's SHA-1 `x-hub-signature` header are ignored.

### Other senders

For another sender that signs with HMAC-SHA256, write a scheme object with these functions:

- `parse` reads the signatures (as bytes), timestamp, and id from the headers.
- `payload` returns the bytes the sender signs.
- `headers` writes the headers for `sign`.
- `key` (optional) turns a string secret into key bytes.

`verify` and `sign` handle the rest: the HMAC, the constant-time compare, multiple secrets, and the timestamp tolerance.

```ts
import * as Webhooks from '@portable/webhooks';

const utf8 = new TextEncoder();
const seconds = (date: Date) => String(Math.floor(date.getTime() / 1000));
const toHex = (bytes: Uint8Array) =>
  Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');

// Acme sends `acme-timestamp: <seconds>` and `acme-signature: <hex>`, the HMAC-SHA256 of
// `{timestamp}.{body}`.
const acme: Webhooks.Scheme = {
  parse(headers) {
    const signature = headers.get('acme-signature');
    const timestamp = headers.get('acme-timestamp');
    if (!signature || !timestamp) {
      throw new Webhooks.VerificationError({ code: 'missing-header', message: 'Missing Acme headers' });
    }
    if (!/^[\da-f]{64}$/.test(signature) || !/^\d+$/.test(timestamp)) {
      throw new Webhooks.VerificationError({ code: 'malformed-header', message: 'Malformed Acme headers' });
    }
    return {
      signatures: [Uint8Array.from(signature.match(/../g)!, (byte) => parseInt(byte, 16))],
      timestamp: new Date(Number(timestamp) * 1000),
    };
  },
  payload: ({ timestamp, body }) =>
    new Uint8Array([...utf8.encode(`${seconds(timestamp!)}.`), ...body]),
  headers: ({ signature, timestamp }) => ({
    'acme-timestamp': seconds(timestamp),
    'acme-signature': toHex(signature),
  }),
};

const { body } = await Webhooks.verify(request, { scheme: acme, secret: env.ACME_SECRET });
```

This package won't add more built-in schemes. The four in [`src/schemes.ts`](https://github.com/portablejs/portable/blob/main/packages/webhooks/src/schemes.ts) are written the same way.

## Crypto

By default, `verify` and `sign` compute HMAC-SHA256 with `WebCrypto.hmac` from [@portable/web-crypto](https://portablejs.com/packages/web-crypto), which caches up to 16 imported keys.

On Node, `verify` is about 3 times faster with @noble/hashes. To verify many webhooks on Node, install it and pass it as `hmac`:

```ts
import { hmac } from '@noble/hashes/hmac.js';
import { sha256 } from '@noble/hashes/sha2.js';
import * as Webhooks from '@portable/webhooks';

const { body } = await Webhooks.verify(request, {
  scheme: Webhooks.github,
  secret,
  hmac: (_hash, key, data) => hmac(sha256, key, data),
});
```

## Types

| Type | Description |
| --- | --- |
| `Webhooks.Secret` | `string \| Uint8Array`, the `secret` option. A string goes through the scheme's `key` function, or is encoded as UTF-8 if there is none. A `Uint8Array` is the raw key. |
| `Webhooks.Hmac` | The `hmac` option: `(hash, key, data) => Uint8Array \| Promise<Uint8Array>`, re-exported from [@portable/web-crypto](https://portablejs.com/packages/web-crypto). See [Crypto](#crypto). |
| `Webhooks.VerificationError.Code` | `VerificationError.code`: `'missing-header'`, `'malformed-header'`, `'signature'`, or `'timestamp'`. |

## Why use this over the provider libraries

One package verifies all four schemes and any other HMAC-SHA256 sender. It has no dependencies outside `@portable/*`, so you don't need the stripe, svix, or @slack/bolt SDK for one function.

- The HMAC covers the body bytes as received. Stripe and standardwebhooks decode and re-encode the body, so a byte order mark or invalid UTF-8 fails verification.
- The timestamp tolerance applies in both directions. Stripe and Slack accept any future timestamp.
- A GitHub signature needs the `sha256=` prefix and exactly 64 hex digits. The web build of @octokit/webhooks-methods accepts a bare signature and skips non-hex characters.
- A truncated signature fails, because lengths are compared first. Svix's Rust library let one pass (CVE-2024-21491).
- A timestamp must be an integer number of seconds. standardwebhooks and Stripe read `123abc` as `123`.
- Stripe's `tolerance` is in seconds, so its `300` becomes `tolerance: 300_000`. Stripe's `tolerance: 0` turns the check off, but here `0` requires the exact second and `Infinity` turns it off.
- Stripe's `generateTestHeaderString` takes `timestamp` in seconds. `sign` takes a `Date` or `Temporal.Instant` as `now`.
- @octokit/webhooks-methods's `verify` returns `false` for a bad signature. `Webhooks.verify` throws.
- Stripe and standardwebhooks parse the JSON body. `verify` returns the text.
- `verify` doesn't reject Stripe's thin events (`v2.core.event`), because it doesn't parse the body.

### Performance

<!-- bench:start -->
<table>
<thead><tr><th align="left">Library</th><th align="right">Ops/s</th><th align="left">Relative</th><th></th></tr></thead>
<tbody>
<tr><th colspan="4" align="left">Verify a Standard Webhook</th></tr>
<tr><td>@portable/webhooks with @noble/hashes</td><td align="right">59,300</td><td>3.3× faster</td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="160" height="12" alt="" /></td></tr>
<tr><td>svix</td><td align="right">59,200</td><td>3.3× faster</td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="160" height="12" alt="" /></td></tr>
<tr><td>standardwebhooks</td><td align="right">47,400</td><td>2.6× faster</td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="128" height="12" alt="" /></td></tr>
<tr><td>@portable/webhooks</td><td align="right">17,900</td><td></td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="48" height="12" alt="" /></td></tr>
<tr><th colspan="4" align="left">Verify a Stripe webhook</th></tr>
<tr><td>stripe, <code>constructEvent</code></td><td align="right">102,000</td><td>5.8× faster</td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="160" height="12" alt="" /></td></tr>
<tr><td>@portable/webhooks with @noble/hashes</td><td align="right">55,800</td><td>3.2× faster</td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="88" height="12" alt="" /></td></tr>
<tr><td>@portable/webhooks</td><td align="right">17,500</td><td></td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="27" height="12" alt="" /></td></tr>
<tr><td>stripe, <code>constructEventAsync</code></td><td align="right">13,500</td><td>1.3× slower</td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="21" height="12" alt="" /></td></tr>
<tr><th colspan="4" align="left">Verify a GitHub webhook</th></tr>
<tr><td>@octokit/webhooks-methods, Node build</td><td align="right">232,000</td><td>12× faster</td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="160" height="12" alt="" /></td></tr>
<tr><td>@portable/webhooks with @noble/hashes</td><td align="right">67,700</td><td>3.5× faster</td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="47" height="12" alt="" /></td></tr>
<tr><td>@portable/webhooks</td><td align="right">19,300</td><td></td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="13" height="12" alt="" /></td></tr>
<tr><td>@octokit/webhooks-methods, web build</td><td align="right">16,800</td><td>1.1× slower</td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="12" height="12" alt="" /></td></tr>
<tr><th colspan="4" align="left">Verify a Slack request</th></tr>
<tr><td>@slack/bolt</td><td align="right">87,400</td><td>4.6× faster</td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="160" height="12" alt="" /></td></tr>
<tr><td>@portable/webhooks with @noble/hashes</td><td align="right">60,700</td><td>3.2× faster</td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="111" height="12" alt="" /></td></tr>
<tr><td>@portable/webhooks</td><td align="right">19,100</td><td></td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="35" height="12" alt="" /></td></tr>
</tbody>
</table>

Operations per second from `pnpm bench`, higher is better, in Node 24.22.0, on Intel(R) Xeon(R) Processor @ 2.10GHz (4 cores). Each benchmark lists only the libraries that can do the same work, fastest first. The relative speed compares each library with @portable/webhooks, and the bars are scaled to the fastest library.

| Library | Version | Minified and gzipped | Runtime dependencies | Node built-ins | TypeScript types |
| --- | --- | ---: | ---: | --- | --- |
| @portable/webhooks | – | 5.2 kB | 6 | none | included |
| @portable/webhooks with @noble/hashes | – | 8.0 kB | 7 | none | included |
| standardwebhooks | 1.1.1 | 4.6 kB | 2 | `Buffer` | included |
| svix | 2.8.0 | 4.5 kB | 3 | `Buffer` | included |
| stripe, `constructEventAsync` | 23.0.0 | 30 kB | 0 | `Buffer` | included |
| stripe, `constructEvent` | 23.0.0 | 30 kB | 0 | `Buffer` | included |
| @octokit/webhooks-methods, web build | 6.0.0 | 0.4 kB | 0 | none | included |
| @octokit/webhooks-methods, Node build | 6.0.0 | 0.4 kB | 0 | none | included |
| @slack/bolt | 5.1.0 | 1.3 kB | 98 | `crypto` | included |

Sizes cover the imports in the usage example, or the equivalent imports of each library, bundled for the browser by `scripts/bundle-size.ts`. Runtime dependencies count every package installed with the published package. A library that uses Node built-ins needs polyfills in a browser and the `nodejs_compat` flag in Cloudflare Workers.
<!-- bench:end -->

The second column passes @noble/hashes as `hmac`, as in [Crypto](#crypto). In browsers and Workers, the default WebCrypto HMAC is fast.
