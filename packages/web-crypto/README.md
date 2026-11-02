# @portable/web-crypto

Functions over `crypto.subtle` that take and return bytes: `digest`, `hmac`, and `hkdf`; Ed25519 and X25519 keys from 32-byte seeds; PEM key import; the public key of a private key; and ECDSA signature conversion between DER and raw `r || s`. All cryptography is done by `crypto.subtle`. Runs in browsers, Cloudflare Workers, Node 24+, Bun, and Deno.

Replaces [ecdsa-sig-formatter](https://www.npmjs.com/package/ecdsa-sig-formatter) and hand-written WebCrypto wrappers.

```sh
npm install @portable/web-crypto
```

```ts
import * as WebCrypto from '@portable/web-crypto';

const hash = await WebCrypto.digest('SHA-256', 'hello');
const mac = await WebCrypto.hmac('SHA-256', 'whsec_secret', body);
const key = await WebCrypto.hkdf('SHA-256', sharedSecret, { info: 'my app v1', length: 32 });

const { privateKey, publicKey } = await WebCrypto.importSeed('Ed25519', seed);
const rsaKey = await WebCrypto.importPem({ name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, pem);

const raw = WebCrypto.derToRawEcdsa(new Uint8Array(assertion.signature));
await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, credentialKey, raw, signedData);
```

## API

Functions take any `Uint8Array`, including a `subarray` or a Node `Buffer`, and read only the bytes in its view. They return `Uint8Array<ArrayBuffer>`, which `crypto.subtle` accepts as a `BufferSource`. `Hash` is `'SHA-1' | 'SHA-256' | 'SHA-384' | 'SHA-512'`.

| Function | Returns | Description |
| --- | --- | --- |
| `digest(hash, data, options?)` | `Promise<Uint8Array>` | Hashes `data`. A string is hashed as UTF-8. |
| `hmac(hash, key, data, options?)` | `Promise<Uint8Array>` | HMAC (RFC 2104). `key` and `data` are bytes or UTF-8 strings. An empty key works. Caches up to 16 imported keys of at most 256 bytes. |
| `hkdf(hash, key, options?)` | `Promise<Uint8Array>` | HKDF (RFC 5869) extract and expand. `key` is bytes or a UTF-8 string. |
| `importSeed(algorithm, seed, options?)` | `Promise<CryptoKeyPair>` | Imports a 32-byte `'Ed25519'` or `'X25519'` private key and returns it with its public key. The private key gets `['sign']` for Ed25519 or `['deriveBits', 'deriveKey']` for X25519. The public key gets `['verify']` for Ed25519 and none for X25519. |
| `importPem(algorithm, pem, options?)` | `Promise<CryptoKey>` | Imports the first `PRIVATE KEY` (PKCS #8), `RSA PRIVATE KEY` (PKCS #1), `PUBLIC KEY` (SubjectPublicKeyInfo), or `RSA PUBLIC KEY` (PKCS #1) block of a PEM string or its bytes. `algorithm` is what `crypto.subtle.importKey` takes. |
| `publicKeyOf(privateKey, options?)` | `Promise<CryptoKey>` | The extractable public key of an extractable Ed25519, X25519, ECDSA, ECDH, or RSA private key. `sign` becomes `verify`, `decrypt` becomes `encrypt`, and `unwrapKey` becomes `wrapKey`. Other usages are dropped. |
| `derToRawEcdsa(signature, options?)` | `Uint8Array` | DER to raw `r \|\| s`. Accepts only strict DER. |
| `rawToDerEcdsa(signature)` | `Uint8Array` | Raw `r \|\| s` to DER. The curve follows from the length: 64, 96, or 132 bytes. |

| Option | Of | Default | Description |
| --- | --- | --- | --- |
| `signal` | every async function | | Checked before and after each `crypto.subtle` call, which can't be cancelled. If it aborts during a call, the promise rejects with `signal.reason` when the call finishes. |
| `info` | `hkdf` | empty | Context for the derived key, bytes, or a UTF-8 string. |
| `length` | `hkdf` | the hash length | Bytes to derive, at most 255 times the hash length. |
| `salt` | `hkdf` | empty | Bytes or a UTF-8 string. An empty salt means a hash-length run of zero bytes (RFC 5869). |
| `extractable` | `importSeed` | `false` | Whether the private key can be exported. The public key always can. |
| `extractable` | `importPem` | `false` | Whether the key can be exported. |
| `usages` | `importPem` | by algorithm | For a private or public key: `['sign']` or `['verify']` for RSASSA-PKCS1-v1_5, RSA-PSS, ECDSA, and Ed25519; `['decrypt', 'unwrapKey']` or `['encrypt', 'wrapKey']` for RSA-OAEP; and `['deriveBits', 'deriveKey']` or none for ECDH and X25519. Required for other algorithms, or `importPem` rejects with a `RangeError`. |
| `namedCurve` | `derToRawEcdsa` | `'P-256'` | `'P-256'`, `'P-384'`, or `'P-521'`. Sets the width of `r` and `s` in the output. |

The functions throw `WebCrypto.InvalidInputError` for malformed DER; a raw signature or seed of the wrong length; or a key that isn't an extractable private key. `importPem` also throws it for a PEM string with no key block, invalid base64, or a key that doesn't match `algorithm`.

`importPem` wraps every `importKey` error in `InvalidInputError`, including one for a malformed `algorithm`, because Chromium and Firefox throw different errors. It rejects with `WebCrypto.UnsupportedError` for an `EC PRIVATE KEY` (SEC 1), an encrypted key, or a certificate.

Other `crypto.subtle` errors, such as one for an HKDF `length` over the limit, are passed on unchanged.

## Types

| Type | Description |
| --- | --- |
| `WebCrypto.Hash` | `'SHA-1' \| 'SHA-256' \| 'SHA-384' \| 'SHA-512'`, the algorithm names WebCrypto uses. |
| `WebCrypto.Digest` | A sync or async function `(hash, data) => bytes`. [@portable/oauth1](https://portablejs.com/packages/oauth1) takes one as `digest`, and `WebCrypto.digest` has this type. |
| `WebCrypto.Hmac` | A sync or async function `(hash, key, data) => bytes`. [@portable/webhooks](https://portablejs.com/packages/webhooks) takes one as `hmac`, and `WebCrypto.hmac` has this type. |
| `WebCrypto.Hasher` | An incremental hash `{ update(data), digest() }`, the shape of noble's `sha256.create()`. [@portable/dkim](https://portablejs.com/packages/dkim), [@portable/arc](https://portablejs.com/packages/arc), and [@portable/mail-auth](https://portablejs.com/packages/mail-auth) take a function that returns one as `hasher`. |
| `WebCrypto.NamedCurve` | `'P-256' \| 'P-384' \| 'P-521'`, the `namedCurve` option of `derToRawEcdsa`. |
| `WebCrypto.SeedAlgorithm` | `'Ed25519' \| 'X25519'`, the algorithms `importSeed` takes. |

## Why use this over hand-written WebCrypto calls

Each helper replaces a few lines of `crypto.subtle` calls and avoids a common mistake in them.

- In TypeScript 5.9 and later, `crypto.subtle` rejects a plain `Uint8Array` as a `BufferSource`, so you'd need `.slice()` or a cast at every call. These functions take any `Uint8Array` and copy it only if its buffer isn't an `ArrayBuffer`.
- `crypto.subtle.digest(hash, bytes.buffer)` hashes the whole buffer, not the view. These functions read only the view.
- WebCrypto refuses an empty HMAC key. `hmac` uses a single zero byte instead, which gives the same result (RFC 2104).
- Importing the HMAC key takes about two thirds of an HMAC's time on Node. `hmac` caches up to 16 imported keys, so signing again with the same secret skips the import.
- WebCrypto can't import a raw Ed25519 or X25519 private key or return its public key. `importSeed` does both.
- WebCrypto has no PEM import and can't import PKCS #1 RSA keys (`RSA PRIVATE KEY`), which `openssl genrsa` writes. `importPem` reads both forms and handles CRLF line breaks and text before the block.
- WebAuthn and OpenSSL produce DER ECDSA signatures, but `crypto.subtle.verify` and JWS take raw `r || s`. WebCrypto can't convert between them.

On Node, node:crypto and @noble/hashes hash small inputs 5 to 15 times faster, because each `crypto.subtle` call is async. `importSeed` with `extractable: false` imports the key twice.

<!-- bench:start -->
<table>
<thead><tr><th align="left">Library</th><th align="right">Ops/s</th><th align="left">Relative</th><th></th></tr></thead>
<tbody>
<tr><th colspan="4" align="left">SHA-256 of 1 KB</th></tr>
<tr><td><code>node:crypto</code></td><td align="right">429,000</td><td>15× faster</td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="160" height="12" alt="" /></td></tr>
<tr><td>@noble/hashes</td><td align="right">136,000</td><td>4.9× faster</td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="51" height="12" alt="" /></td></tr>
<tr><td>@portable/web-crypto</td><td align="right">27,900</td><td></td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="10" height="12" alt="" /></td></tr>
<tr><th colspan="4" align="left">SHA-256 of 1 MB</th></tr>
<tr><td>@portable/web-crypto</td><td align="right">928</td><td></td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="160" height="12" alt="" /></td></tr>
<tr><td>@noble/hashes</td><td align="right">170</td><td>5.5× slower</td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="29" height="12" alt="" /></td></tr>
<tr><th colspan="4" align="left">HMAC-SHA256 of 1 KB</th></tr>
<tr><td><code>node:crypto</code></td><td align="right">271,000</td><td>15× faster</td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="160" height="12" alt="" /></td></tr>
<tr><td>@noble/hashes</td><td align="right">84,700</td><td>4.6× faster</td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="50" height="12" alt="" /></td></tr>
<tr><td>@portable/web-crypto</td><td align="right">18,500</td><td></td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="11" height="12" alt="" /></td></tr>
<tr><th colspan="4" align="left">Derive 32 bytes with HKDF</th></tr>
<tr><td><code>node:crypto</code></td><td align="right">215,000</td><td>12× faster</td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="160" height="12" alt="" /></td></tr>
<tr><td>@noble/hashes</td><td align="right">113,000</td><td>6.5× faster</td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="84" height="12" alt="" /></td></tr>
<tr><td>@portable/web-crypto</td><td align="right">17,300</td><td></td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="13" height="12" alt="" /></td></tr>
<tr><th colspan="4" align="left">Import an Ed25519 seed</th></tr>
<tr><td>@portable/web-crypto</td><td align="right">15,600</td><td></td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="160" height="12" alt="" /></td></tr>
<tr><td>@noble/curves</td><td align="right">2,920</td><td>5.3× slower</td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="30" height="12" alt="" /></td></tr>
<tr><th colspan="4" align="left">Read the public key of a P-256 key</th></tr>
<tr><td><code>node:crypto</code></td><td align="right">1,240,000</td><td>60× faster</td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="160" height="12" alt="" /></td></tr>
<tr><td>@portable/web-crypto</td><td align="right">20,500</td><td></td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="3" height="12" alt="" /></td></tr>
<tr><th colspan="4" align="left">Convert a DER ECDSA signature to raw</th></tr>
<tr><td>@portable/web-crypto</td><td align="right">4,900,000</td><td></td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="160" height="12" alt="" /></td></tr>
<tr><td>ecdsa-sig-formatter</td><td align="right">818,000</td><td>6.0× slower</td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="27" height="12" alt="" /></td></tr>
<tr><td>@noble/curves</td><td align="right">361,000</td><td>14× slower</td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="12" height="12" alt="" /></td></tr>
<tr><th colspan="4" align="left">Convert a raw ECDSA signature to DER</th></tr>
<tr><td>ecdsa-sig-formatter</td><td align="right">2,250,000</td><td>1.4× faster</td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="160" height="12" alt="" /></td></tr>
<tr><td>@portable/web-crypto</td><td align="right">1,620,000</td><td></td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="115" height="12" alt="" /></td></tr>
<tr><td>@noble/curves</td><td align="right">253,000</td><td>6.4× slower</td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="18" height="12" alt="" /></td></tr>
</tbody>
</table>

Operations per second from `pnpm bench`, higher is better, in Node 24.22.0, on Intel(R) Xeon(R) Processor @ 2.10GHz (4 cores). Each benchmark lists only the libraries that can do the same work, fastest first. The relative speed compares each library with @portable/web-crypto, and the bars are scaled to the fastest library.

| Library | Version | Minified and gzipped | Runtime dependencies | Node built-ins | TypeScript types |
| --- | --- | ---: | ---: | --- | --- |
| @portable/web-crypto | – | 2.7 kB | 2 | none | included |
| ecdsa-sig-formatter | 1.0.11 | 1.7 kB | 1 | `buffer` | included |
| @noble/hashes | 2.4.0 | 3.4 kB | 0 | none | included |
| @noble/curves | 2.4.0 | 20 kB | 1 | none | included |
| `node:crypto` | – | built in | – | Node only | – |

Sizes cover the imports in the usage example, or the equivalent imports of each library, bundled for the browser by `scripts/bundle-size.ts`. Runtime dependencies count every package installed with the published package. A library that uses Node built-ins needs polyfills in a browser and the `nodejs_compat` flag in Cloudflare Workers.
<!-- bench:end -->

- ecdsa-sig-formatter's `derToJose` and `joseToDer` use base64url text. `derToRawEcdsa` and `rawToDerEcdsa` use bytes, so convert with [@portable/base64](https://portablejs.com/packages/base64).
- ecdsa-sig-formatter takes the JWS `alg`, such as `'ES384'`. `derToRawEcdsa` takes `namedCurve`, which defaults to `'P-256'`, so pass `'P-384'` or `'P-521'` for ES384 or ES512.
- `derToRawEcdsa` accepts only strict DER, so each signature has one encoding. It throws `WebCrypto.InvalidInputError` for a long-form length where the short form fits, an unneeded leading zero, or an empty or negative INTEGER. `derToJose` accepts all of these.
- `derToRawEcdsa` rejects an INTEGER one byte too long for the curve, unless its top byte is zero. `derToJose` drops that byte and returns a different `r` or `s`.
