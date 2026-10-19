# @portable/web-push

Sends Web Push notifications, with aes128gcm payload encryption (RFC 8291) and VAPID (RFC 8292), on WebCrypto and `fetch`. Runs in browsers, Cloudflare Workers, Deno, Bun and Node 24+.

Replaces [web-push](https://www.npmjs.com/package/web-push), which uses `node:crypto` and `node:https` and runs only on Node.

```sh
npm install @portable/web-push
```

Generate a VAPID key pair once. Store the private key as a secret, and give the public key to browsers as `applicationServerKey`:

```ts
import * as WebPush from '@portable/web-push'

const { publicKey, privateKey } = await WebPush.generateVapidKeys()
```

In the browser, subscribe and send `subscription.toJSON()` to your server. On the server, send to it:

```ts
import * as WebPush from '@portable/web-push'

export default {
  async fetch(request: Request, env: Env) {
    const subscription: WebPush.Subscription = await env.DB.getSubscription(/* … */)
    const result = await WebPush.send(subscription, JSON.stringify({ title: 'New message' }), {
      vapid: {
        subject: 'mailto:ops@example.com',
        publicKey: env.VAPID_PUBLIC_KEY,
        privateKey: env.VAPID_PRIVATE_KEY,
      },
      ttl: 3600,
    })
    if (result.kind === 'gone') await env.DB.deleteSubscription(subscription.endpoint)
    return new Response(null, { status: 204 })
  },
}
```

Keys from web-push's `generateVAPIDKeys()` work unchanged, so existing subscriptions keep working.

## API

| Export | Does |
| --- | --- |
| `send(subscription, payload, options)` | Encrypts `payload`, signs the request with VAPID, POSTs it to the subscription's endpoint, and returns `{ kind: 'sent', status }` or, for a 404 or 410, `{ kind: 'gone', status }`. |
| `toRequest(subscription, payload, options)` | Returns the `Request` that `send` would pass to `fetch`, to send it yourself or put it on a queue. |
| `encrypt(subscription, payload, options?)` | Returns the aes128gcm body for `payload`: an 86-byte header, then one AES-GCM record. |
| `generateVapidKeys(options?)` | Returns a new `{ publicKey, privateKey }` pair as base64url strings. |
| `maxPayloadBytes` | `3993`, the largest payload in bytes. |
| `ResponseError` | Thrown by `send` when the push service answers with any other status, such as 400, 403, 413 or 429. It has `status`, `headers` and the response `body` as text. |
| `InvalidInputError` | Thrown when the subscription can't be used: its endpoint isn't an `https:` URL, or a payload is given and `p256dh` isn't a P-256 public key or `auth` isn't 16 bytes. Subscriptions come from browsers, so delete one that fails this way. |

`payload` is a string, sent as UTF-8, or a `Uint8Array`. Pass `undefined` to send a push with no data, which also works for a subscription without `keys`. An empty string is encrypted and arrives as empty data.

`subscription` has the shape of `PushSubscription.toJSON()`: `{ endpoint, keys: { p256dh, auth } }`. The keys may be base64url or standard base64, with or without padding, or a `Uint8Array`.

A payload longer than `maxPayloadBytes` throws `InvalidInputError` too. A mistake in the call throws a `TypeError` for an option of the wrong type, and a `RangeError` for a malformed `vapid` key or subject, an unknown `urgency`, a `topic` that isn't base64url, or a `ttl` that isn't a non-negative integer.

### Options

| Option | Default | Description |
| --- | --- | --- |
| `vapid` | required | `{ subject, publicKey, privateKey }`. `subject` is a `mailto:` or `https:` URL the push service can contact you at. The keys are base64url strings from `generateVapidKeys`. |
| `ttl` | `2419200` (four weeks) | Seconds the push service keeps the message for an offline browser. `0` means deliver now or drop it. |
| `urgency` | not sent | `'very-low'`, `'low'`, `'normal'` or `'high'`. Push services may hold back low-urgency messages to save battery. |
| `topic` | not sent | Up to 32 base64url characters. A new message with the same topic replaces an undelivered one. |
| `fetch` | `globalThis.fetch` | `send` only. Called with the `Request`. Pass one to add retries, logging or a proxy. |
| `signal` | none | Cancels the encryption and the `fetch`. Rejects with `signal.reason`. |
| `salt`, `keyPair` | random | `encrypt` only. The 16-byte salt and the server's ECDH P-256 key pair. Only for test vectors: reusing either for two messages weakens the encryption. |

The JWT in the `Authorization` header expires 12 hours after it is signed. `send` and `toRequest` reuse a token for the same push service and keys for up to an hour, because Apple rejects senders that sign new tokens more often.

## Types

| Type | Description |
| --- | --- |
| `WebPush.VapidKeys` | `{ publicKey, privateKey }` as base64url strings, as `generateVapidKeys` returns them. |
| `WebPush.Vapid` | The `vapid` option: `VapidKeys` and a `subject`. |

## Why use this over web-push

It runs anywhere WebCrypto and `fetch` do, so a Worker or a Deno or Bun server can send notifications. It has one dependency, `@portable/base64`, where web-push has five, including an ASN.1 library and an HTTPS proxy agent.

- A 404 or 410 returns `{ kind: 'gone' }`, so you can tell an expired subscription from a failed send without checking status codes yourself.
- Payloads over 3993 bytes are rejected before sending. web-push has no limit, and http_ece splits a payload over about 4079 bytes into several records, which push services reject.
- `ttl` must be a non-negative integer. web-push sends `TTL: NaN` for a non-numeric value, and Apple rejects it.
- `p256dh` must be a point on the P-256 curve and `auth` exactly 16 bytes, as RFC 8291 requires, and both must be valid base64. web-push checks lengths only, and skips characters outside the alphabet.
- VAPID keys must be a matching pair, and a `mailto:` subject with a space is rejected. Push services reject both, and web-push sends them anyway.
- Only `https:` endpoints are accepted, so a subscription posted by a client can't point your server at an internal `http:` address.
- `signal` cancels the encryption and the request. web-push has only a socket idle `timeout`.

### Performance

<!-- bench:start -->
| | @portable/web-push | web-push | The same WebCrypto calls by hand |
| --- | ---: | ---: | ---: |
| Encrypt a 186-byte payload | 1,680 | 4,280 | 1,790 |
| Encrypt 64 payloads at once | 57.4 | 67.3 | 53.7 |
| Sign a VAPID JWT | 8,230 | 10,200 | 11,100 |
| Build a push request | 1,500 | 2,770 | 1,310 |

Operations per second from `pnpm bench`, higher is better, in Node 24.22.0, on Intel(R) Xeon(R) Processor @ 2.10GHz (4 cores). A dash means the library has no equivalent.

| | @portable/web-push | web-push | The same WebCrypto calls by hand |
| --- | --- | --- | --- |
| Minified and gzipped | 4.6 kB | 32 kB | built in |
| Runtime dependencies | 2 | 16 | – |
| Node built-ins used | none | `assert`, `buffer`, `crypto`, `http`, `https`, `net`, `stream`, `tls`, `url`, `util` | none |
| TypeScript types | included | `@types/web-push` | – |
| Version compared | – | 3.6.7 | – |

Sizes cover the imports in the usage example, or the equivalent imports of each library, bundled for the browser by `scripts/bundle-size.ts`. Runtime dependencies count every package installed with the published package. A library that uses Node built-ins needs polyfills in a browser and the `nodejs_compat` flag in Cloudflare Workers.
<!-- bench:end -->

On Node, web-push is about 3.5 times faster at encrypting one message and 1.4 times faster at encrypting many at once. Node runs each WebCrypto call on its thread pool, and an encryption makes 9 calls, while web-push makes synchronous `node:crypto` calls that block the event loop for their duration. Building a request is faster than encrypting plus signing because the token is reused.

## Migrating

| web-push | @portable/web-push |
| --- | --- |
| `webpush.setVapidDetails(subject, publicKey, privateKey)` | Pass `vapid: { subject, publicKey, privateKey }` to each call. |
| `await webpush.sendNotification(subscription, payload, options)` | `await WebPush.send(subscription, payload, { vapid, ...options })` |
| `options.TTL` | `ttl` |
| `options.urgency`, `options.topic` | `urgency`, `topic` |
| `options.vapidDetails` | `vapid` |
| `options.timeout` | `signal: AbortSignal.timeout(ms)` |
| `options.proxy`, `options.agent` | A `fetch` option that uses them. |
| `options.headers` | Set them on the `Request` from `toRequest`, then `fetch` it. |
| `options.contentEncoding: 'aesgcm'` | Not supported. Every current browser accepts aes128gcm. |
| `options.gcmAPIKey`, `setGCMAPIKey` | Not supported. GCM shut down in 2019, and FCM takes VAPID. |
| `catch (e) { if (e.statusCode === 410 \|\| e.statusCode === 404) … }` | `if ((await WebPush.send(…)).kind === 'gone') …` |
| `WebPushError` with `statusCode`, `headers`, `body` | `ResponseError` with `status`, `headers` (a `Headers`), `body` |
| `webpush.generateVAPIDKeys()` | `await WebPush.generateVapidKeys()` |
| `webpush.generateRequestDetails(…)` | `await WebPush.toRequest(…)`, which returns a `Request`. |
| `webpush.encrypt(p256dh, auth, payload, 'aes128gcm').cipherText` | `await WebPush.encrypt({ keys: { p256dh, auth } }, payload)` |
| `webpush.getVapidHeaders(…)` | `(await WebPush.toRequest(subscription, undefined, { vapid })).headers.get('authorization')` |
| `web-push generate-vapid-keys` (CLI) | `node -e "import('@portable/web-push').then(async (w) => console.log(await w.generateVapidKeys()))"` |

These behaviors differ from web-push:

- A 404 or 410 resolves with `{ kind: 'gone' }` instead of rejecting.
- An empty string payload is encrypted and sent. web-push sends no body for `''`, so the service worker's `event.data` is `null`.
- No `Urgency` header unless you pass `urgency`. web-push always sends `Urgency: normal`, which push services treat the same as no header.
- Payloads over 3993 bytes, `http:` endpoints, `auth` keys longer than 16 bytes, `mailto:` subjects with spaces, and a `ttl` that isn't a non-negative integer throw. web-push accepts them.
- The VAPID token is reused for up to an hour per push service. web-push signs a new one for every message.
