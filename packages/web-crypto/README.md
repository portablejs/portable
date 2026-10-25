# @portable/web-crypto

Functions over `crypto.subtle` that take and return bytes: `digest`, `hmac` and `hkdf`, Ed25519 and X25519 keys from 32-byte seeds, PEM key import, the public key of a private key, and ECDSA signatures converted between DER and raw `r || s`. It contains no cryptography of its own. Runs in browsers, Cloudflare Workers, Deno, Bun and Node 24+.

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

Every function that takes bytes takes any `Uint8Array`, including a `subarray` or a Node `Buffer`, and reads only the bytes the view covers. Every result is a `Uint8Array<ArrayBuffer>` that `crypto.subtle` accepts as a `BufferSource` without a copy. `Hash` is `'SHA-1' | 'SHA-256' | 'SHA-384' | 'SHA-512'`.

| Function | Returns | Description |
| --- | --- | --- |
| `digest(hash, data, options?)` | `Promise<Uint8Array>` | Hashes `data`. A string is hashed as UTF-8. |
| `hmac(hash, key, data, options?)` | `Promise<Uint8Array>` | HMAC (RFC 2104). `key` and `data` are bytes or UTF-8 strings. An empty key is accepted. The imported `CryptoKey` is cached for up to 16 keys of at most 256 bytes. |
| `hkdf(hash, key, options?)` | `Promise<Uint8Array>` | HKDF (RFC 5869) extract and expand. |
| `importSeed(algorithm, seed, options?)` | `Promise<CryptoKeyPair>` | Imports a 32-byte `'Ed25519'` or `'X25519'` private key and returns it with its public key. |
| `importPem(algorithm, pem, options?)` | `Promise<CryptoKey>` | Imports the first `PRIVATE KEY` (PKCS #8), `RSA PRIVATE KEY` (PKCS #1), `PUBLIC KEY` (SubjectPublicKeyInfo) or `RSA PUBLIC KEY` (PKCS #1) block of a PEM string or its bytes, skipping other blocks. `algorithm` is what `crypto.subtle.importKey` takes. |
| `publicKeyOf(privateKey, options?)` | `Promise<CryptoKey>` | The public key of an extractable Ed25519, X25519, ECDSA, ECDH or RSA private key. |
| `derToRawEcdsa(signature, options?)` | `Uint8Array` | DER to raw `r \|\| s`. Accepts only strict DER. |
| `rawToDerEcdsa(signature)` | `Uint8Array` | Raw `r \|\| s` to DER. The curve follows from the length: 64, 96 or 132 bytes. |

| Option | Of | Default | Description |
| --- | --- | --- | --- |
| `signal` | every async function | | Rejects with `signal.reason` once aborted. |
| `info` | `hkdf` | empty | Context for the derived key, bytes or a UTF-8 string. |
| `length` | `hkdf` | the hash length | Bytes to derive, at most 255 times the hash length. |
| `salt` | `hkdf` | empty | Bytes or a UTF-8 string. RFC 5869 treats an empty salt as zero bytes as long as the hash. |
| `extractable` | `importSeed` | `false` | Whether the private key can be exported. The public key always can. |
| `extractable` | `importPem` | `false` | Whether the key can be exported. |
| `usages` | `importPem` | by algorithm | The key's usages. The default is `['sign']` or `['verify']` for RSASSA-PKCS1-v1_5, RSA-PSS, ECDSA and Ed25519, `['decrypt', 'unwrapKey']` or `['encrypt', 'wrapKey']` for RSA-OAEP, and `['deriveBits', 'deriveKey']` or none for ECDH and X25519. For another algorithm, `usages` is required and a missing one throws a `RangeError`. |
| `namedCurve` | `derToRawEcdsa` | `'P-256'` | `'P-256'`, `'P-384'` or `'P-521'`. It sets the width of `r` and `s` in the output. |

The functions throw or reject with `WebCrypto.InvalidInputError` when the DER is malformed, a raw signature or seed has the wrong length, a key is not an extractable private key, or a PEM string has no key block, isn't valid base64 or isn't a key for `algorithm`. `importPem` rejects with `WebCrypto.UnsupportedError` when the PEM block is of a kind it doesn't import: an `EC PRIVATE KEY` (SEC 1), an encrypted key or a certificate. It wraps any error from `importKey` in `InvalidInputError`, including the one for a malformed `algorithm`, because Chromium and Firefox throw different errors for a key that doesn't match the algorithm. Other errors from `crypto.subtle`, such as the one for an HKDF `length` over the limit, are passed on unchanged.

## Types

| Type | Description |
| --- | --- |
| `WebCrypto.Hash` | `'SHA-1' \| 'SHA-256' \| 'SHA-384' \| 'SHA-512'`, the algorithm names WebCrypto uses. |
| `WebCrypto.Digest` | `(hash, data) => bytes`, sync or async. `@portable/oauth1` takes one as `digest`, and `WebCrypto.digest` has this type. |
| `WebCrypto.Hmac` | `(hash, key, data) => bytes`, sync or async. `@portable/webhooks` takes one as `hmac`, and `WebCrypto.hmac` has this type. |
| `WebCrypto.Hasher` | An incremental hash `{ update(data), digest() }`, the shape of noble's `sha256.create()`. `@portable/dkim`, `@portable/arc` and `@portable/mail-auth` take a function that returns one as `hasher`. |
| `WebCrypto.NamedCurve` | `'P-256' \| 'P-384' \| 'P-521'`, the `namedCurve` option of `derToRawEcdsa`. |
| `WebCrypto.SeedAlgorithm` | `'Ed25519' \| 'X25519'`, the algorithms `importSeed` takes. |

## Why use this over hand-written WebCrypto calls

Each helper replaces a few lines you would otherwise write yourself, and handles a trap that hand-written calls often miss.

- In TypeScript 5.9 and later, a plain `Uint8Array` is `Uint8Array<ArrayBufferLike>`, which `crypto.subtle` doesn't accept as a `BufferSource`. If you call `crypto.subtle` yourself, you add `.slice()` or a cast at every call. These functions take any `Uint8Array`, copy it only when its buffer is not an `ArrayBuffer` (a `SharedArrayBuffer`, for example), and return `Uint8Array<ArrayBuffer>`.
- `crypto.subtle.digest(hash, bytes.buffer)` hashes the whole buffer, not the view. These functions take a `Uint8Array` and read only the bytes the view covers.
- WebCrypto refuses an empty HMAC key. HMAC pads the key with zero bytes, so `hmac` uses a single zero byte, which gives the result RFC 2104 defines.
- If you call `crypto.subtle` yourself, you usually import the HMAC key on every call, and `importKey` takes about two thirds of the time of an HMAC on Node. `hmac` keeps up to 16 imported keys, so signing again with the same secret, such as a webhook secret, skips the import.
- WebCrypto imports an Ed25519 or X25519 private key only as PKCS #8 or JWK, and has no call that returns the public key of a private key. `importSeed` adds the 16-byte PKCS #8 header and reads the public key back through a JWK export.
- WebCrypto has no PEM import, and imports RSA keys only as PKCS #8 or SubjectPublicKeyInfo, while `openssl genrsa` and many key files use PKCS #1 (`RSA PRIVATE KEY`). If you strip the armor yourself, the usual regex often misses CRLF line breaks or text before the block, and the key still fails to import if it is PKCS #1. `importPem` reads both forms and wraps PKCS #1 in the structure WebCrypto takes.
- WebAuthn and OpenSSL produce DER ECDSA signatures, while `crypto.subtle.verify` and JWS take raw `r || s`, and WebCrypto has no function that converts between them.

The helpers cost what the `crypto.subtle` calls under them cost. On Node, synchronous hashing in node:crypto or @noble/hashes is 5 to 15 times faster than any `crypto.subtle` call on small input, because each WebCrypto call goes through a promise and a thread hop. `importSeed` with `extractable: false` imports the key twice, once to read its public key and once to keep it private. `rawToDerEcdsa` is slower than `joseToDer` because V8 allocates a typed array over 64 bytes outside the JavaScript heap, and `joseToDer` instead slices a `Buffer` from Node's shared 8 KB pool.

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

- ecdsa-sig-formatter's `derToJose` and `joseToDer` take and return base64url text. `derToRawEcdsa` and `rawToDerEcdsa` take and return bytes, so encode and decode the base64url text JWS uses with [@portable/base64](../base64).
- ecdsa-sig-formatter takes the JWS `alg`, such as `'ES384'`. `derToRawEcdsa` takes `namedCurve` instead, and it defaults to `'P-256'`, so pass `'P-384'` or `'P-521'` for ES384 or ES512 signatures.
- `derToRawEcdsa` throws `WebCrypto.InvalidInputError` for a long-form length where the short form fits, such as `30 81 06` for a 6-byte SEQUENCE. ecdsa-sig-formatter's `derToJose` accepts it.
- `derToRawEcdsa` also rejects an INTEGER with a leading zero it does not need, an empty INTEGER or a negative INTEGER, which `derToJose` accepts.
- `derToRawEcdsa` rejects an INTEGER one byte longer than the curve allows, if its top byte is not zero. `derToJose` drops that byte and returns a different `r` or `s`.
- Strict DER gives each signature one encoding, so if you deduplicate signatures or use them as identifiers, a second encoding of a signature you already have is rejected.
