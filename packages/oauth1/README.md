# @portable/oauth1

Signs OAuth 1.0a requests ([RFC 5849](https://www.rfc-editor.org/rfc/rfc5849)) with HMAC-SHA1, HMAC-SHA256, RSA-SHA1 or PLAINTEXT. Runs in browsers, Cloudflare Workers, Deno, Bun and Node 24+.

Replaces [oauth-1.0a](https://www.npmjs.com/package/oauth-1.0a) and the OAuth 1.0a half of [oauth](https://www.npmjs.com/package/oauth) (node-oauth).

## Why use this over oauth-1.0a and node-oauth

Both libraries sign some requests wrongly, and the server then rejects the signature. This package computes the signature from the `Request` you send, with WebCrypto, in any runtime above.

- A `+` in the query and a default port such as `:443` are signed as RFC 5849 requires. oauth-1.0a signs them wrongly ([#24](https://github.com/ddo/oauth-1.0a/issues/24), [#59](https://github.com/ddo/oauth-1.0a/issues/59)).
- Repeated query names and a form body passed as a string are signed. node-oauth signs `a[0]` and `a[1]` ([#375](https://github.com/ciaranj/node-oauth/issues/375)) and leaves the string body out ([#366](https://github.com/ciaranj/node-oauth/issues/366)).
- A JSON body is not signed as parameters ([oauth-1.0a #60](https://github.com/ddo/oauth-1.0a/issues/60)). `bodyHash: true` signs its hash instead.
- RSA-SHA1 takes a PKCS #1 key as OpenSSL writes it. oauth-1.0a percent-encodes the key before signing ([#109](https://github.com/ddo/oauth-1.0a/issues/109)).
- The nonce comes from `crypto.getRandomValues`. oauth-1.0a's comes from `Math.random`.
- On Node, the default WebCrypto hash made an `Authorization` header for a GET request about 5× slower than oauth-1.0a with `node:crypto`, at about 125 µs. With `digest` set to `@noble/hashes`, it was about 1.15× faster than oauth-1.0a and 2× faster than node-oauth, and a signed form POST was about 1.2× slower than oauth-1.0a.

```sh
npm install @portable/oauth1
```

```ts
import * as OAuth1 from '@portable/oauth1'

const request = new Request('https://api.example.com/1.1/statuses/update.json', {
  method: 'POST',
  body: new URLSearchParams({ status: 'Hello Ladies + Gentlemen, a signed OAuth request!' }),
})
const response = await fetch(
  await OAuth1.sign(request, {
    consumer: { key: 'xvz1evFS4wEEPTGEFPHBog', secret: 'kAcSOqF21Fu85e7zjz7ZN2U4ZRhfV3WpwPAoE3Z7kBw' },
    token: { key: '370773112-GmHxMAgYyLbNEtIKZeRNFsMKPR9EyMZeS9weJAEb', secret: 'LswwdoUaIvS8ltyTt5jkRh4J50vUPVVHtR2YPi5kE' },
  }),
)
```

`OAuth1.sign(request, options)` returns a new `Request` with an `Authorization: OAuth …` header. Like `new Request(request)`, it uses up the body of the request you pass in. `OAuth1.authorization(request, options)` returns only the header value and leaves the request unchanged, for HTTP clients that don't take a `Request`. Both are async.

The signature covers what the server will see, because it is computed from the `Request` itself:

- The method is upper-cased. The URL is normalized by the `URL` parser: scheme and host are lowercased, the default port is dropped, an empty path becomes `/` and the fragment is ignored.
- Query parameters and `application/x-www-form-urlencoded` body parameters are decoded (`+` is a space) and re-encoded with RFC 3986 percent-encoding, so `!*'()` become `%21%2A%27%28%29`. Repeated names are all signed, sorted by name and then by value. Bytes that aren't UTF-8 keep their value.
- JSON, multipart and other bodies are not signed. Pass `bodyHash: true` to sign their hash as `oauth_body_hash`, as LTI 1.x and other providers require.

## Options

| Option | Default | Description |
| --- | --- | --- |
| `consumer` | required | `{ key, secret }`, or `{ key, privateKey }` for RSA-SHA1. |
| `token` | none | `{ key, secret }` token credentials. Leave it out when requesting temporary credentials. |
| `signatureMethod` | `'HMAC-SHA1'` | `'HMAC-SHA1'`, `'HMAC-SHA256'`, `'RSA-SHA1'` or `'PLAINTEXT'`. |
| `realm` | none | Sent as the first header parameter. It is not signed. |
| `callback` | none | `oauth_callback`, for the temporary credentials request. |
| `verifier` | none | `oauth_verifier`, for the token request. |
| `bodyHash` | `false` | Add `oauth_body_hash`: the base64 SHA-1 of the body, or SHA-256 with HMAC-SHA256. Form bodies never get one, because their parameters are signed. |
| `nonce`, `timestamp` | random, now | Fix `oauth_nonce` and `oauth_timestamp` (seconds) in tests. The default nonce is 32 hex digits from `crypto.getRandomValues`. |
| `placement` | `'header'` | `sign()` only. `'query'` appends the protocol parameters to the URL instead of setting `Authorization`. |
| `digest` | `crypto.subtle.digest` | `(algorithm: 'SHA-1' \| 'SHA-256', data: Uint8Array) => Uint8Array \| Promise<Uint8Array>`, used for HMAC and `oauth_body_hash`. |

`InvalidInputError` is thrown for an RSA key that can't be used, and `UnsupportedError` for another signature method.

### RSA-SHA1

`privateKey` is a `CryptoKey` for `RSASSA-PKCS1-v1_5` with SHA-1, or a PEM string. Both `-----BEGIN PRIVATE KEY-----` (PKCS #8) and `-----BEGIN RSA PRIVATE KEY-----` (PKCS #1, as OpenSSL writes it) are accepted. A PEM string is imported with `crypto.subtle` on every call, so import a `CryptoKey` once when you sign often:

```ts
const privateKey = await crypto.subtle.importKey('pkcs8', der, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-1' }, false, ['sign'])
await OAuth1.sign(request, { signatureMethod: 'RSA-SHA1', consumer: { key, privateKey }, token })
```

## Crypto

HMAC is built on `digest`, which hashes with `crypto.subtle.digest` by default, so the package has no dependency for it. RSA-SHA1 uses `crypto.subtle.sign`.

On Node, `crypto.subtle.digest` is 4 to 8 times slower than `@noble/hashes`. To sign many requests on Node, install `@noble/hashes` and pass it as `digest`:

```ts
import { sha1 } from '@noble/hashes/legacy.js'
import { sha256 } from '@noble/hashes/sha2.js'
import * as OAuth1 from '@portable/oauth1'

const digest: OAuth1.Digest = (algorithm, data) => (algorithm === 'SHA-1' ? sha1(data) : sha256(data))
await OAuth1.sign(request, { consumer, token, digest })
```

## Migrating

| oauth-1.0a | @portable/oauth1 |
| --- | --- |
| `OAuth({ consumer, signature_method: 'HMAC-SHA1', hash_function })` | `{ consumer }`. The hash is built in. |
| `oauth.toHeader(oauth.authorize({ url, method, data }, token))` | `await OAuth1.authorization(new Request(url, { method, body: new URLSearchParams(data) }), { consumer, token })` |
| `includeBodyHash: true` | `bodyHash: true` |
| `realm` | `realm` |
| `oauth.getNonce = () => …`, `oauth.getTimeStamp = () => …` | `nonce`, `timestamp` |
| `nonce_length`, `version`, `parameter_seperator`, `last_ampersand` | Not supported. See below. |
| `form: oauth.authorize(request, token)` (parameters in the body) | Not supported. Use the header, or `placement: 'query'`. |

| oauth (node-oauth) | @portable/oauth1 |
| --- | --- |
| `new OAuth(requestUrl, accessUrl, key, secret, '1.0', callback, 'HMAC-SHA1')` | `{ consumer: { key, secret }, callback }` and `fetch` |
| `oa.getOAuthRequestToken(cb)` | `fetch(await OAuth1.sign(new Request(requestUrl, { method: 'POST' }), { consumer, callback }))`, then read the form-encoded response |
| `oa.getOAuthAccessToken(token, secret, verifier, cb)` | `fetch(await OAuth1.sign(new Request(accessUrl, { method: 'POST' }), { consumer, token: { key: token, secret }, verifier }))` |
| `oa.get(url, token, secret, cb)` | `fetch(await OAuth1.sign(new Request(url), { consumer, token }))` |
| `oa.post(url, token, secret, body, contentType, cb)` | `fetch(await OAuth1.sign(new Request(url, { method: 'POST', body, headers: { 'content-type': contentType } }), { consumer, token }))` |
| `oa.signUrl(url, token, secret)` | `(await OAuth1.sign(new Request(url), { consumer, token, placement: 'query' })).url` |
| `oa.authHeader(url, token, secret, method)` | `await OAuth1.authorization(new Request(url, { method }), { consumer, token })` |
| `new OAuth(…, privateKeyPem, …, 'RSA-SHA1')` | `{ signatureMethod: 'RSA-SHA1', consumer: { key, privateKey: privateKeyPem } }` |
| `new OAuthEcho(realm, verifyUrl, …)` | `await OAuth1.authorization(new Request(verifyUrl), { consumer, token, realm })`, sent as `X-Verify-Credentials-Authorization` |

These behaviors differ on purpose:

- Both libraries sign some requests wrongly, and those requests are signed correctly here: a `+` or an escaped name in the query (oauth-1.0a), a name in both the query and the body (oauth-1.0a keeps one), repeated query names (node-oauth signs `a[0]` and `a[1]`), a form body passed as a string (node-oauth doesn't sign it), a JSON body passed as `data` (oauth-1.0a signs its keys), a default port such as `:443` (oauth-1.0a keeps it), and an uppercase host. [PARITY.md](test/PARITY.md) lists each one with its test.
- The default signature method is HMAC-SHA1, where oauth-1.0a defaults to PLAINTEXT.
- `oauth_version` is always `1.0`, and the signing key always ends in `&` when there is no token secret. RFC 5849 requires both. oauth-1.0a's `version` and `last_ampersand` options and node-oauth's `1.0A` version string are not supported.
- The header separator is always `", "`, and the nonce is always 32 hex digits from `crypto.getRandomValues` instead of `Math.random`.
- There is no HTTP client. `fetch` follows redirects with the same `Authorization` header, whose signature covers the old URL. node-oauth signs the request again for the new URL. To do the same, pass `redirect: 'manual'` and sign a new request for the `Location`.
