# @portable/oauth1

Signs OAuth 1.0a requests ([RFC 5849](https://www.rfc-editor.org/rfc/rfc5849)) with HMAC-SHA1, HMAC-SHA256, RSA-SHA1, or PLAINTEXT. Runs in browsers, Cloudflare Workers, Node 24+, Bun, and Deno.

Replaces [oauth-1.0a](https://www.npmjs.com/package/oauth-1.0a) and the OAuth 1.0a half of [oauth](https://www.npmjs.com/package/oauth) (node-oauth).

```sh
npm install @portable/oauth1
```

```ts
import * as OAuth1 from '@portable/oauth1';

const request = new Request('https://api.example.com/1.1/statuses/update.json', {
  method: 'POST',
  body: new URLSearchParams({ status: 'Hello Ladies + Gentlemen, a signed OAuth request!' }),
});
const response = await fetch(
  await OAuth1.sign(request, {
    consumer: { key: 'xvz1evFS4wEEPTGEFPHBog', secret: 'kAcSOqF21Fu85e7zjz7ZN2U4ZRhfV3WpwPAoE3Z7kBw' },
    token: { key: '370773112-GmHxMAgYyLbNEtIKZeRNFsMKPR9EyMZeS9weJAEb', secret: 'LswwdoUaIvS8ltyTt5jkRh4J50vUPVVHtR2YPi5kE' },
  }),
);
```

`OAuth1.sign(request, options)` resolves to a new `Request` with an `Authorization: OAuth …` header. Like `new Request(request)`, it uses up the original request's body.

`OAuth1.authorization(request, options)` resolves to only the header value and leaves the request unchanged. Use it with HTTP clients that don't take a `Request`, such as axios or got:

```ts
const header = await OAuth1.authorization(
  new Request(url, { method: 'POST', body: new URLSearchParams({ status: 'Hello' }) }),
  { consumer, token },
);
```

The package only signs requests. It can't verify a signature you receive.

The signature is computed from the `Request` itself, so it covers what the server sees:

- The method is upper-cased. The URL is normalized by the `URL` parser: scheme and host are lowercased, the default port is dropped, an empty path becomes `/`, and the fragment is ignored.
- Query and form body parameters are decoded (`+` is a space) and re-encoded with RFC 3986 percent-encoding, so `!*'()` become `%21%2A%27%28%29`. Repeated names are all signed, sorted by name and then value. Percent-encoded bytes that aren't UTF-8 are kept as they are.
- A form body is signed only when the content type is `application/x-www-form-urlencoded`, which `new Request` sets for a `URLSearchParams` body.
- JSON, multipart, and other bodies are not signed. Pass `bodyHash: true` to sign their hash as `oauth_body_hash`, as LTI 1.x and some other providers require.

## Getting a token

Getting token credentials for a user takes three steps ([RFC 5849 section 2](https://www.rfc-editor.org/rfc/rfc5849#section-2)).

First, request temporary credentials by signing with `callback` and no `token`. Then redirect the user to the server's authorization URL with the returned `oauth_token`:

```ts
import * as OAuth1 from '@portable/oauth1';

const consumer = { key: 'dpf43f3p2l4k3l03', secret: 'kd94hf93k423kf44' };

const initiate = new Request('https://photos.example.net/initiate', { method: 'POST' });
const response = await fetch(
  await OAuth1.sign(initiate, { consumer, callback: 'https://printer.example.com/ready' }),
);
const temporary = new URLSearchParams(await response.text());
const secret = temporary.get('oauth_token_secret')!;

const authorize = new URL('https://photos.example.net/authorize');
authorize.searchParams.set('oauth_token', temporary.get('oauth_token')!);
const redirect = Response.redirect(authorize, 302);
```

Keep the temporary `secret` until the user comes back, e.g. in the session. If you can't receive a callback, pass `callback: 'oob'`, and the server shows the verifier to the user instead.

When the user approves, the server redirects to `callback` with `oauth_token` and `oauth_verifier` in the query. Sign a request to the token URL with the temporary credentials as `token` and the `verifier`. The response holds the token credentials to pass as `token` from then on:

```ts
const query = new URL(request.url).searchParams;
const response = await fetch(
  await OAuth1.sign(new Request('https://photos.example.net/token', { method: 'POST' }), {
    consumer,
    token: { key: query.get('oauth_token')!, secret },
    verifier: query.get('oauth_verifier')!,
  }),
);
const credentials = new URLSearchParams(await response.text());
const token = { key: credentials.get('oauth_token')!, secret: credentials.get('oauth_token_secret')! };
```

## Options

| Option | Default | Description |
| --- | --- | --- |
| `consumer` | required | `{ key, secret }`, or `{ key, privateKey }` for RSA-SHA1. |
| `token` | none | `{ key, secret }` token credentials. Leave it out when requesting temporary credentials. |
| `signatureMethod` | `'HMAC-SHA1'` | `'HMAC-SHA1'`, `'HMAC-SHA256'`, `'RSA-SHA1'`, or `'PLAINTEXT'`. |
| `realm` | none | Sent as the first header parameter. Not signed. |
| `callback` | none | `oauth_callback`, for the temporary credentials request. |
| `verifier` | none | `oauth_verifier`, for the token request. |
| `bodyHash` | `false` | Add `oauth_body_hash`: the base64 SHA-1 of the body, or SHA-256 with HMAC-SHA256. Never added for form bodies, whose parameters are signed. |
| `nonce`, `now` | random, `new Date()` | Set `oauth_nonce` and `oauth_timestamp`, e.g. in tests. `now` is a `Date` or a `Temporal.Instant`, sent in whole seconds. The default nonce is 32 hex digits from `crypto.getRandomValues`. |
| `signal` | none | Aborting rejects with `signal.reason` and cancels a body still being read. In Firefox, which has no `Request.prototype.body`, the body is read whole and isn't cancelled. |
| `placement` | `'header'` | `sign()` only. `'query'` appends the protocol parameters to the URL instead of setting `Authorization`, and doesn't send `realm`. |
| `hmac` | `crypto.subtle` HMAC | `(algorithm: 'SHA-1' \| 'SHA-256', key, data) => Uint8Array \| Promise<Uint8Array>`, used for HMAC-SHA1 and HMAC-SHA256. |
| `digest` | `crypto.subtle.digest` | `(algorithm: 'SHA-1' \| 'SHA-256', data: Uint8Array) => Uint8Array \| Promise<Uint8Array>`, used for `oauth_body_hash`. |

`sign` and `authorization` reject with a `RangeError` for an unusable RSA key or an invalid `now`, and with `UnsupportedError` for an unknown signature method. Both check `now` and the signature method before reading the body.

### RSA-SHA1

`privateKey` is a `CryptoKey` for `RSASSA-PKCS1-v1_5` with SHA-1, or a PEM string in PKCS #8 (`-----BEGIN PRIVATE KEY-----`) or PKCS #1 (`-----BEGIN RSA PRIVATE KEY-----`, as OpenSSL writes it).

A PEM string is imported on every call. If you sign often, import a `CryptoKey` once with `WebCrypto.importPem` from [@portable/web-crypto](https://portablejs.com/packages/web-crypto):

```ts
const privateKey = await WebCrypto.importPem({ name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-1' }, pem);
await OAuth1.sign(request, { signatureMethod: 'RSA-SHA1', consumer: { key, privateKey }, token });
```

## Crypto

By default, HMAC and `oauth_body_hash` use `crypto.subtle`, and so does RSA-SHA1.

In Node, WebCrypto HMAC is several times slower than @noble/hashes. To sign many requests in Node, pass @noble/hashes as `hmac`, and as `digest` if you use `bodyHash`:

```ts
import { hmac as nobleHmac } from '@noble/hashes/hmac.js';
import { sha1 } from '@noble/hashes/legacy.js';
import { sha256 } from '@noble/hashes/sha2.js';
import * as OAuth1 from '@portable/oauth1';

const hmac: OAuth1.Hmac = (algorithm, key, data) =>
  nobleHmac(algorithm === 'SHA-1' ? sha1 : sha256, key, data);
await OAuth1.sign(request, { consumer, token, hmac });
```

## Types

| Type | Description |
| --- | --- |
| `OAuth1.SignatureMethod` | `'HMAC-SHA1' \| 'HMAC-SHA256' \| 'RSA-SHA1' \| 'PLAINTEXT'`. |
| `OAuth1.Credentials` | The `consumer` and `signatureMethod` options. |
| `OAuth1.Token` | `{ key, secret? }`, the `token` option. |
| `OAuth1.Hmac` | The `hmac` option: `(algorithm, key, data) => Uint8Array \| Promise<Uint8Array>`, re-exported from [@portable/web-crypto](https://portablejs.com/packages/web-crypto). Called only with `'SHA-1'` or `'SHA-256'`. |
| `OAuth1.Digest` | The `digest` option: `(algorithm, data) => Uint8Array \| Promise<Uint8Array>`, re-exported from [@portable/web-crypto](https://portablejs.com/packages/web-crypto). Called only with `'SHA-1'` or `'SHA-256'`. |

## Why use this over oauth-1.0a and node-oauth

Both libraries sign some requests wrongly, so the server rejects them. This package signs the `Request` you send, with WebCrypto, in any JavaScript runtime.

- A `+` in the query and a default port such as `:443` are signed as RFC 5849 requires. oauth-1.0a gets both wrong ([#24](https://github.com/ddo/oauth-1.0a/issues/24), [#59](https://github.com/ddo/oauth-1.0a/issues/59)).
- Repeated query names and a string form body are signed. node-oauth signs `a[0]` and `a[1]` ([#375](https://github.com/ciaranj/node-oauth/issues/375)) and leaves the string body out ([#366](https://github.com/ciaranj/node-oauth/issues/366)).
- A JSON body is not signed as parameters ([oauth-1.0a #60](https://github.com/ddo/oauth-1.0a/issues/60)). `bodyHash: true` signs its hash instead.
- RSA-SHA1 accepts a PKCS #1 key. oauth-1.0a percent-encodes the key before signing ([#109](https://github.com/ddo/oauth-1.0a/issues/109)).
- The nonce comes from `crypto.getRandomValues`, not `Math.random`.
- An escaped query name and an uppercase host are signed correctly, and a name in both the query and the body keeps both values. oauth-1.0a gets all three wrong. [PARITY.md](https://github.com/portablejs/portable/blob/main/packages/oauth1/test/PARITY.md) lists each case with its test.
- The default signature method is HMAC-SHA1. oauth-1.0a defaults to PLAINTEXT.
- `oauth_version` is always `1.0`, and the signing key always ends in `&` when there is no token secret (RFC 5849). oauth-1.0a's `version` and `last_ampersand` options and node-oauth's `1.0A` version string are not supported.
- The header separator is always `", "` and the nonce is always 32 hex digits. oauth-1.0a's `parameter_seperator` and `nonce_length` options have no equivalent.
- Instead of overriding oauth-1.0a's `getTimeStamp`, which returns seconds, pass `now: new Date(seconds * 1000)`.
- Protocol parameters go only in the `Authorization` header, or in the URL with `placement: 'query'`. oauth-1.0a can also put them in a form body.
- The package has no HTTP client. On a same-origin redirect, `fetch` resends the `Authorization` header, signed for the old URL, and on a cross-origin redirect it drops it. node-oauth signs again for the new URL. To do the same, pass `redirect: 'manual'` and sign a new request for the `Location`.

### Performance

<!-- bench:start -->
<table>
<thead><tr><th align="left">Library</th><th align="right">Ops/s</th><th align="left">Relative</th><th></th></tr></thead>
<tbody>
<tr><th colspan="4" align="left">Sign a GET request</th></tr>
<tr><td>@portable/oauth1 with @noble/hashes</td><td align="right">47,700</td><td>6.6× faster</td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="160" height="12" alt="" /></td></tr>
<tr><td>oauth-1.0a</td><td align="right">41,600</td><td>5.8× faster</td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="140" height="12" alt="" /></td></tr>
<tr><td>oauth</td><td align="right">25,800</td><td>3.6× faster</td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="87" height="12" alt="" /></td></tr>
<tr><td>@portable/oauth1</td><td align="right">7,210</td><td></td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="24" height="12" alt="" /></td></tr>
<tr><th colspan="4" align="left">Sign a form POST</th></tr>
<tr><td>oauth-1.0a</td><td align="right">30,000</td><td>4.9× faster</td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="160" height="12" alt="" /></td></tr>
<tr><td>@portable/oauth1 with @noble/hashes</td><td align="right">26,200</td><td>4.3× faster</td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="140" height="12" alt="" /></td></tr>
<tr><td>@portable/oauth1</td><td align="right">6,110</td><td></td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="33" height="12" alt="" /></td></tr>
</tbody>
</table>

Operations per second from `pnpm bench`, higher is better, in Node 24.22.0, on Intel(R) Xeon(R) Processor @ 2.10GHz (4 cores). Each benchmark lists only the libraries that can do the same work, fastest first. The relative speed compares each library with @portable/oauth1, and the bars are scaled to the fastest library.

| Library | Version | Minified and gzipped | Runtime dependencies | Node built-ins | TypeScript types |
| --- | --- | ---: | ---: | --- | --- |
| @portable/oauth1 | – | 5.3 kB | 6 | none | included |
| @portable/oauth1 with @noble/hashes | – | 8.0 kB | 7 | none | included |
| oauth-1.0a | 2.2.6 | 1.7 kB | 0 | none | included |
| oauth | 0.10.2 | 5.2 kB | 0 | `Buffer`, `crypto`, `http`, `https`, `querystring`, `url` | none |

Sizes cover the imports in the usage example, or the equivalent imports of each library, bundled for the browser by `scripts/bundle-size.ts`. Runtime dependencies count every package installed with the published package. A library that uses Node built-ins needs polyfills in a browser and the `nodejs_compat` flag in Cloudflare Workers.
<!-- bench:end -->

The second column passes @noble/hashes as `hmac`, as the Crypto section shows. WebCrypto HMAC is fast in browsers and Workers, so you can keep the default there.
