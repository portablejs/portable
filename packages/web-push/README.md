# @portable/web-push

Sends Web Push notifications with aes128gcm encryption (RFC 8291) and VAPID (RFC 8292), using WebCrypto and `fetch`. Runs in browsers, Cloudflare Workers, Node 24+, Bun, and Deno.

Replaces [web-push](https://www.npmjs.com/package/web-push), which runs only on Node.

```sh
npm install @portable/web-push
```

Generate a VAPID key pair once. Store the private key as a secret, and give browsers the public key as `applicationServerKey`:

```ts
import * as WebPush from '@portable/web-push';

const { publicKey, privateKey } = await WebPush.generateVapidKeys();
```

In the browser, subscribe with the public key and send `subscription.toJSON()` to your server:

```ts
const registration = await navigator.serviceWorker.register('/sw.js');
const subscription = await registration.pushManager.subscribe({
  userVisibleOnly: true,
  applicationServerKey: publicKey,
});
await fetch('/subscriptions', { method: 'POST', body: JSON.stringify(subscription.toJSON()) });
```

In the service worker, show a notification for each push. `event.data` is `null` for a push sent without `payload`:

```ts
declare const self: ServiceWorkerGlobalScope;

self.addEventListener('push', (event: PushEvent) => {
  const message = event.data?.json() ?? { title: 'New message' };
  event.waitUntil(self.registration.showNotification(message.title));
});
```

On the server, send to the subscription:

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
| `send({ subscription, payload, vapid, ... })` | Encrypts `payload`, signs the request with VAPID, and POSTs it to the subscription's endpoint. Returns `{ kind: 'sent', status }`, or `{ kind: 'gone', status }` for a 404 or 410. |
| `toRequest({ subscription, payload, vapid, ... })` | Returns the `Request` that `send` would pass to `fetch`, e.g. to put on a queue. Send it within 12 hours, before its VAPID token expires. |
| `encrypt({ subscription, payload, ... })` | Returns the aes128gcm body for `payload`: an 86-byte header, then one AES-GCM record. |
| `generateVapidKeys(options?)` | Returns a new `{ publicKey, privateKey }` pair as base64url strings. |
| `maxPayloadBytes` | `3993`, the largest payload in bytes. |
| `ResponseError` | Thrown by `send` for any other status, such as 400, 403, 413, or 429. It has `status`, `response`, and the response text as `body`. Read only `response.status` and `response.headers`, because the body was already read. |
| `InvalidInputError` | Thrown when the subscription can't be used: its endpoint isn't `https:`, or a payload is given and `keys` is missing, a key isn't base64, `p256dh` isn't a P-256 public key, or `auth` isn't 16 bytes. Delete a subscription that fails this way. |
| `MaxBytesError` | Thrown before sending when the payload is longer than `maxPayloadBytes`. Its `maxBytes` is `3993`. The subscription is still valid. |

`payload` is a string, sent as UTF-8, or a `Uint8Array`. Leave it out to send a push with no data, which also works for a subscription without `keys`. An empty string arrives as empty data.

`subscription` has the shape of `PushSubscription.toJSON()`: `{ endpoint, keys: { p256dh, auth } }`. The keys can be base64url or base64, with or without padding, or a `Uint8Array`.

An option of the wrong type throws a `TypeError`. A malformed `vapid` key or subject, an unknown `urgency`, a `topic` that isn't base64url, a `ttl` that isn't a non-negative integer, or an invalid `now` throws a `RangeError`.

### Options

| Option | Default | Description |
| --- | --- | --- |
| `subscription` | required | The browser's subscription, as above. |
| `payload` | none | The message. `encrypt` requires it. |
| `vapid` | required | `{ subject, publicKey, privateKey }`. `subject` is a `mailto:` or `https:` URL where the push service can contact you. Apple rejects an `https://localhost` subject. The keys are base64url strings from `generateVapidKeys`. |
| `ttl` | `2419200` (four weeks) | Seconds the push service keeps the message for an offline browser. `0` means deliver now or drop it. |
| `urgency` | not sent | `'very-low'`, `'low'`, `'normal'`, or `'high'`. Push services may delay low-urgency messages to save battery. |
| `topic` | not sent | Up to 32 base64url characters. A new message with the same topic replaces an undelivered one. |
| `now` | `new Date()` | The time to sign the VAPID token, as a `Date` or a `Temporal.Instant`. A token can be reused for up to an hour, so it may be signed up to an hour before `now`. |
| `fetch` | `globalThis.fetch` | `send` only. Called with the `Request`. Pass one to add retries, logging, or a proxy. |
| `signal` | none | Cancels the encryption and the `fetch`, and the call rejects with `signal.reason`. |
| `salt`, `keyPair` | random | `encrypt` only. The 16-byte salt and the server's ECDH P-256 key pair. Use only for test vectors, because reusing either weakens the encryption. |

The VAPID token expires 12 hours after it is signed. `send` and `toRequest` reuse a token for the same push service and keys for up to an hour, because Apple rejects senders that sign new tokens more often.

## Types

| Type | Description |
| --- | --- |
| `WebPush.Subscription` | `{ endpoint, expirationTime?, keys? }`, the `subscription` option, as `PushSubscription.toJSON()` returns it. |
| `WebPush.Keys` | `{ p256dh, auth }`, each a base64url or base64 string or a `Uint8Array`. |
| `WebPush.Urgency` | `'very-low' \| 'low' \| 'normal' \| 'high'`, the `urgency` option. |
| `WebPush.VapidKeys` | `{ publicKey, privateKey }` as base64url strings, as `generateVapidKeys` returns them. |
| `WebPush.Vapid` | The `vapid` option: `VapidKeys` and a `subject`. |

## Why use this over web-push

It runs anywhere WebCrypto and `fetch` do, including Workers, Deno, and Bun. Its only dependencies are four `@portable/*` packages. web-push has five, including an ASN.1 library and an HTTPS proxy agent.

- `send` returns `{ kind: 'gone' }` for a 404 or 410, so you don't need to check status codes to find expired subscriptions.
- Payloads over 3993 bytes are rejected before sending. web-push has no limit and splits a payload over about 4079 bytes into several records, which push services reject.
- `ttl` must be a non-negative integer. web-push sends `TTL: NaN` for a non-numeric value, which Apple rejects.
- `p256dh` must be a P-256 point and `auth` exactly 16 bytes (RFC 8291), both in valid base64. web-push checks only lengths and skips invalid characters.
- VAPID keys must be a matching pair, and a `mailto:` subject can't contain a space. web-push sends both, and push services reject them.
- Only `https:` endpoints are accepted, so a subscription from a client can't point your server at an internal `http:` address.
- `signal` cancels the encryption and the request. web-push has only a socket idle `timeout`.
- The VAPID token is reused for up to an hour per push service. web-push signs a new one for every message.
- `contentEncoding: 'aesgcm'` isn't supported. Every current browser accepts aes128gcm.
- `gcmAPIKey` and `setGCMAPIKey` aren't supported. GCM shut down in 2019, and FCM takes VAPID.
- web-push rejects with a `WebPushError` that has `statusCode`, `headers`, and `body`. `send` rejects with a `ResponseError` that has `status`, `response.headers`, and `body`.
- There is no `headers` option. Set headers on the `Request` from `toRequest`, then `fetch` it.
- There are no `proxy` or `agent` options. Pass a `fetch` that uses them.
- An empty string payload is encrypted and sent. web-push sends no body, so `event.data` is `null`.
- `send` sends no `Urgency` header unless you pass `urgency`. web-push always sends `Urgency: normal`, which push services treat the same as no header.

### Performance

<!-- bench:start -->
<table>
<thead><tr><th align="left">Library</th><th align="right">Ops/s</th><th align="left">Relative</th><th></th></tr></thead>
<tbody>
<tr><th colspan="4" align="left">Encrypt a 186-byte payload</th></tr>
<tr><td>web-push</td><td align="right">4,280</td><td>2.5× faster</td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="160" height="12" alt="" /></td></tr>
<tr><td>@portable/web-push</td><td align="right">1,680</td><td></td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="63" height="12" alt="" /></td></tr>
<tr><th colspan="4" align="left">Encrypt 64 payloads at once</th></tr>
<tr><td>web-push</td><td align="right">67.3</td><td>1.2× faster</td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="160" height="12" alt="" /></td></tr>
<tr><td>@portable/web-push</td><td align="right">57.4</td><td></td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="136" height="12" alt="" /></td></tr>
<tr><th colspan="4" align="left">Sign a VAPID JWT</th></tr>
<tr><td>web-push</td><td align="right">10,200</td><td>1.2× faster</td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="160" height="12" alt="" /></td></tr>
<tr><td>@portable/web-push</td><td align="right">8,230</td><td></td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="129" height="12" alt="" /></td></tr>
<tr><th colspan="4" align="left">Build a push request</th></tr>
<tr><td>web-push</td><td align="right">2,770</td><td>1.8× faster</td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="160" height="12" alt="" /></td></tr>
<tr><td>@portable/web-push</td><td align="right">1,500</td><td></td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="87" height="12" alt="" /></td></tr>
</tbody>
</table>

Operations per second from `pnpm bench`, higher is better, in Node 24.22.0, on Intel(R) Xeon(R) Processor @ 2.10GHz (4 cores). Each benchmark lists only the libraries that can do the same work, fastest first. The relative speed compares each library with @portable/web-push, and the bars are scaled to the fastest library.

| Library | Version | Minified and gzipped | Runtime dependencies | Node built-ins | TypeScript types |
| --- | --- | ---: | ---: | --- | --- |
| @portable/web-push | – | 5.6 kB | 5 | none | included |
| web-push | 3.6.7 | 32 kB | 16 | `assert`, `buffer`, `crypto`, `http`, `https`, `net`, `stream`, `tls`, `url`, `util` | @types/web-push |

Sizes cover the imports in the usage example, or the equivalent imports of each library, bundled for the browser by `scripts/bundle-size.ts`. Runtime dependencies count every package installed with the published package. A library that uses Node built-ins needs polyfills in a browser and the `nodejs_compat` flag in Cloudflare Workers.
<!-- bench:end -->

On Node, web-push encrypts about 2.5 times faster, or 1.2 times when encrypting many at once. Each encryption makes 11 WebCrypto calls, which Node runs on its thread pool. web-push's synchronous `node:crypto` calls block the event loop instead.
