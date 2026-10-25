# @portable/web-push

Sends Web Push notifications, with aes128gcm payload encryption (RFC 8291) and VAPID (RFC 8292), on WebCrypto and `fetch`. Runs in browsers, Cloudflare Workers, Deno, Bun and Node 24+.

Replaces [web-push](https://www.npmjs.com/package/web-push), which uses `node:crypto` and `node:https` and runs only on Node.

```sh
npm install @portable/web-push
```

Generate a VAPID key pair once. Store the private key as a secret, and give the public key to browsers as `applicationServerKey`:

```ts
import * as WebPush from '@portable/web-push';

const { publicKey, privateKey } = await WebPush.generateVapidKeys();
```

In the browser, subscribe and send `subscription.toJSON()` to your server. On the server, send to it:

```ts
import * as WebPush from '@portable/web-push';

export default {
  async fetch(request: Request, env: Env) {
    const subscription: WebPush.Subscription = await env.DB.getSubscription(/* … */);
    const result = await WebPush.send({
      subscription,
      payload: JSON.stringify({ title: 'New message' }),
      vapid: {
        subject: 'mailto:ops@example.com',
        publicKey: env.VAPID_PUBLIC_KEY,
        privateKey: env.VAPID_PRIVATE_KEY,
      },
      ttl: 3600,
    });
    if (result.kind === 'gone') {
      await env.DB.deleteSubscription(subscription.endpoint);
    }
    return new Response(null, { status: 204 });
  },
};
```

Keys from web-push's `generateVAPIDKeys()` work unchanged, so existing subscriptions keep working.

## API

| Export | Does |
| --- | --- |
| `send({ subscription, payload, vapid, ... })` | Encrypts `payload`, signs the request with VAPID, POSTs it to the subscription's endpoint, and returns `{ kind: 'sent', status }` or, for a 404 or 410, `{ kind: 'gone', status }`. |
| `toRequest({ subscription, payload, vapid, ... })` | Returns the `Request` that `send` would pass to `fetch`, to send it yourself or put it on a queue. |
| `encrypt({ subscription, payload, ... })` | Returns the aes128gcm body for `payload`: an 86-byte header, then one AES-GCM record. |
| `generateVapidKeys(options?)` | Returns a new `{ publicKey, privateKey }` pair as base64url strings. |
| `maxPayloadBytes` | `3993`, the largest payload in bytes. |
| `ResponseError` | Thrown by `send` when the push service answers with any other status, such as 400, 403, 413 or 429. It has `status`, the whole `response` and its `body` as text. |
| `InvalidInputError` | Thrown when the subscription can't be used: its endpoint isn't an `https:` URL, or a payload is given and `p256dh` isn't a P-256 public key or `auth` isn't 16 bytes. Subscriptions come from browsers, so delete one that fails this way. |
| `MaxBytesError` | Thrown when the payload is longer than `maxPayloadBytes`, before anything is sent. Its `maxBytes` property is `3993`. The subscription is still valid. |

`payload` is a string, sent as UTF-8, or a `Uint8Array`. Leave it out to send a push with no data. A push with no data also works for a subscription without `keys`. An empty string is encrypted and arrives as empty data.

`subscription` has the shape of `PushSubscription.toJSON()`: `{ endpoint, keys: { p256dh, auth } }`. The keys may be base64url or standard base64, with or without padding, or a `Uint8Array`.

A mistake in the call gives a `TypeError` for an option of the wrong type, and a `RangeError` for a malformed `vapid` key or subject, an unknown `urgency`, a `topic` that isn't base64url, a `ttl` that isn't a non-negative integer, or an invalid `now`.

### Options

| Option | Default | Description |
| --- | --- | --- |
| `subscription` | required | The browser's subscription, as above. |
| `payload` | none | The message. `encrypt` requires it. |
| `vapid` | required | `{ subject, publicKey, privateKey }`. `subject` is a `mailto:` or `https:` URL the push service can contact you at. The keys are base64url strings from `generateVapidKeys`. |
| `ttl` | `2419200` (four weeks) | Seconds the push service keeps the message for an offline browser. `0` means deliver now or drop it. |
| `urgency` | not sent | `'very-low'`, `'low'`, `'normal'` or `'high'`. Push services may hold back low-urgency messages to save battery. |
| `topic` | not sent | Up to 32 base64url characters. A new message with the same topic replaces an undelivered one. |
| `now` | `new Date()` | The VAPID token expires 12 hours after this time, given as a `Date` or a `Temporal.Instant`. |
| `fetch` | `globalThis.fetch` | `send` only. Called with the `Request`. Pass one to add retries, logging or a proxy. |
| `signal` | none | Cancels the encryption and the `fetch`, and the call rejects with `signal.reason`. |
| `salt`, `keyPair` | random | `encrypt` only. The 16-byte salt and the server's ECDH P-256 key pair. Only for test vectors: reusing either for two messages weakens the encryption. |

The JWT in the `Authorization` header expires 12 hours after it is signed. `send` and `toRequest` reuse a token for the same push service and keys for up to an hour, because Apple rejects senders that sign new tokens more often.

## Types

| Type | Description |
| --- | --- |
| `WebPush.Subscription` | `{ endpoint, expirationTime?, keys? }`, the `subscription` option, as `PushSubscription.toJSON()` returns it. |
| `WebPush.Keys` | `{ p256dh, auth }`, each a base64url or base64 string or a `Uint8Array`. |
| `WebPush.Urgency` | `'very-low' \| 'low' \| 'normal' \| 'high'`, the `urgency` option. |
| `WebPush.VapidKeys` | `{ publicKey, privateKey }` as base64url strings, as `generateVapidKeys` returns them. |
| `WebPush.Vapid` | The `vapid` option: `VapidKeys` and a `subject`. |

## Why use this over web-push

It runs anywhere WebCrypto and `fetch` do, so you can send notifications from a Worker or from a Deno or Bun server. It depends only on four other `@portable/*` packages, where web-push has five dependencies, including an ASN.1 library and an HTTPS proxy agent.

- `send` returns `{ kind: 'gone' }` for a 404 or 410, so you can tell an expired subscription from a failed send without checking status codes yourself.
- Payloads over 3993 bytes are rejected before sending. web-push has no limit, and http_ece splits a payload over about 4079 bytes into several records, which push services reject.
- `ttl` must be a non-negative integer. web-push sends `TTL: NaN` for a non-numeric value, and Apple rejects it.
- `p256dh` must be a point on the P-256 curve and `auth` exactly 16 bytes, as RFC 8291 requires, and both must be valid base64. web-push checks lengths only, and skips characters outside the alphabet.
- VAPID keys must be a matching pair, and a `mailto:` subject with a space is rejected. Push services reject both, and web-push sends them anyway.
- Only `https:` endpoints are accepted, so a subscription posted by a client can't point your server at an internal `http:` address.
- `signal` cancels the encryption and the request. web-push has only a socket idle `timeout`.
- web-push's `contentEncoding: 'aesgcm'` isn't supported. Every current browser accepts aes128gcm.
- web-push's `gcmAPIKey` option and `setGCMAPIKey` aren't supported. GCM shut down in 2019, and FCM takes VAPID.
- web-push rejects with a `WebPushError` that has `statusCode`, `headers` and `body`. `send` rejects with a `ResponseError` that has `status`, `response.headers` and `body`.
- web-push's `headers` option has no equivalent in `send`. Set the headers on the `Request` from `toRequest`, then `fetch` it.
- web-push's `proxy` and `agent` options have no equivalent. Pass a `fetch` option that uses them.
- An empty string payload is encrypted and sent. web-push sends no body for `''`, so the service worker's `event.data` is `null`.
- `send` sends no `Urgency` header unless you pass `urgency`. web-push always sends `Urgency: normal`, which push services treat the same as no header.
- The VAPID token is reused for up to an hour per push service. web-push signs a new one for every message.

### Performance

<!-- bench:start -->
| Benchmark | Library | Ops/s | Relative | |
| --- | --- | ---: | --- | --- |
| Encrypt a 186-byte payload | web-push | 4,280 | 2.5× faster | ████████████ |
|  | The same WebCrypto calls by hand | 1,790 | 1.1× faster | █████ |
|  | **@portable/web-push** | 1,680 |  | ████▊ |
| | | | | |
| Encrypt 64 payloads at once | web-push | 67.3 | 1.2× faster | ████████████ |
|  | **@portable/web-push** | 57.4 |  | ██████████▎ |
|  | The same WebCrypto calls by hand | 53.7 | 1.1× slower | █████████▋ |
| | | | | |
| Sign a VAPID JWT | The same WebCrypto calls by hand | 11,100 | 1.3× faster | ████████████ |
|  | web-push | 10,200 | 1.2× faster | ███████████ |
|  | **@portable/web-push** | 8,230 |  | ████████▉ |
| | | | | |
| Build a push request | web-push | 2,770 | 1.8× faster | ████████████ |
|  | **@portable/web-push** | 1,500 |  | ██████▌ |
|  | The same WebCrypto calls by hand | 1,310 | 1.1× slower | █████▋ |

Operations per second from `pnpm bench`, higher is better, in Node 24.22.0, on Intel(R) Xeon(R) Processor @ 2.10GHz (4 cores). Each benchmark lists only the libraries that can do the same work, fastest first. The relative speed compares each library with @portable/web-push, and the bars are scaled to the fastest library.

| Library | Version | Minified and gzipped | Runtime dependencies | Node built-ins | TypeScript types |
| --- | --- | ---: | ---: | --- | --- |
| @portable/web-push | – | 5.6 kB | 5 | none | included |
| web-push | 3.6.7 | 32 kB | 16 | `assert`, `buffer`, `crypto`, `http`, `https`, `net`, `stream`, `tls`, `url`, `util` | `@types/web-push` |
| The same WebCrypto calls by hand | – | built in | – | none | – |

Sizes cover the imports in the usage example, or the equivalent imports of each library, bundled for the browser by `scripts/bundle-size.ts`. Runtime dependencies count every package installed with the published package. A library that uses Node built-ins needs polyfills in a browser and the `nodejs_compat` flag in Cloudflare Workers.
<!-- bench:end -->

On Node, web-push is about 2.5 times faster at encrypting one message and 1.2 times faster at encrypting many at once. Node runs each WebCrypto call on its thread pool, and an encryption makes 11 calls, while web-push makes synchronous `node:crypto` calls that block the event loop for their duration. Building a request is faster than encrypting plus signing because the token is reused.
