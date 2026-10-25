# @portable/web-crypto

Bytes-in, bytes-out helpers over `crypto.subtle`: `digest`, `hmac` and `hkdf`, Ed25519 and X25519 keys from 32-byte seeds, PEM key import, the public key of a private key, and ECDSA signatures converted between DER and raw `r || s`. It contains no cryptography of its own. Runs in browsers, Cloudflare Workers, Deno, Bun and Node 24+.

Replaces [ecdsa-sig-formatter](https://www.npmjs.com/package/ecdsa-sig-formatter) and the WebCrypto wrappers that apps write by hand.

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

The functions throw or reject with `WebCrypto.InvalidInputError` when the DER is malformed, a raw signature or seed has the wrong length, a key is not an extractable private key, or a PEM string has no key block, isn't valid base64 or isn't a key for `algorithm`. `importPem` rejects with `WebCrypto.UnsupportedError` for a PEM block it doesn't import: an `EC PRIVATE KEY` (SEC 1), an encrypted key or a certificate. It wraps any error from `importKey` in `InvalidInputError`, including the one for a malformed `algorithm`, because Chromium and Firefox throw different errors for a key that doesn't fit the algorithm. Other errors from `crypto.subtle`, such as the one for an HKDF `length` over the limit, are passed on unchanged.

## Types

| Type | Description |
| --- | --- |
| `WebCrypto.Hash` | `'SHA-1' \| 'SHA-256' \| 'SHA-384' \| 'SHA-512'`, the algorithm names WebCrypto uses. |
| `WebCrypto.Digest` | `(hash, data) => bytes`, sync or async. `@portable/oauth1` takes one as `digest`, and `WebCrypto.digest` fits it. |
| `WebCrypto.Hmac` | `(hash, key, data) => bytes`, sync or async. `@portable/webhooks` takes one as `hmac`, and `WebCrypto.hmac` fits it. |
| `WebCrypto.Hasher` | An incremental hash `{ update(data), digest() }`, the shape of noble's `sha256.create()`. `@portable/dkim`, `@portable/arc` and `@portable/mail-auth` take a function that returns one as `hasher`. |
| `WebCrypto.NamedCurve` | `'P-256' \| 'P-384' \| 'P-521'`, the `namedCurve` option of `derToRawEcdsa`. |
| `WebCrypto.SeedAlgorithm` | `'Ed25519' \| 'X25519'`, the algorithms `importSeed` takes. |

## Why use this over hand-written WebCrypto calls

Each helper replaces a few lines that apps write by hand, and handles a trap those lines often miss.

- In TypeScript 5.9 and later, a plain `Uint8Array` is `Uint8Array<ArrayBufferLike>`, which `crypto.subtle` doesn't accept as a `BufferSource`. Hand-written code adds `.slice()` or a cast at every call. These functions take any `Uint8Array`, copy it only when its buffer is not an `ArrayBuffer` (a `SharedArrayBuffer`, for example), and return `Uint8Array<ArrayBuffer>`.
- `crypto.subtle.digest(hash, bytes.buffer)` hashes the whole buffer, not the view. These functions take a `Uint8Array` and read only the bytes the view covers.
- WebCrypto refuses an empty HMAC key. HMAC pads the key with zero bytes, so `hmac` uses a single zero byte, which gives the result RFC 2104 defines.
- Hand-written code imports the HMAC key on every call, and `importKey` takes about two thirds of the time of an HMAC on Node. `hmac` keeps up to 16 imported keys, so signing again with the same secret, such as a webhook secret, skips the import.
- WebCrypto imports an Ed25519 or X25519 private key only as PKCS #8 or JWK, and has no call that returns the public key of a private key. `importSeed` adds the 16-byte PKCS #8 header and reads the public key back through a JWK export.
- WebCrypto has no PEM import, and imports RSA keys only as PKCS #8 or SubjectPublicKeyInfo, while `openssl genrsa` and many key files use PKCS #1 (`RSA PRIVATE KEY`). Hand-written code strips the armor with a regex that often misses CRLF line breaks or text before the block, and fails on PKCS #1. `importPem` reads both forms and wraps PKCS #1 in the structure WebCrypto takes.
- WebAuthn and OpenSSL produce DER ECDSA signatures, and `crypto.subtle.verify` and JWS take raw `r || s`.

The helpers cost what the `crypto.subtle` calls under them cost. On Node, synchronous hashing in node:crypto or @noble/hashes is 5 to 15 times faster than any `crypto.subtle` call on small input, because each WebCrypto call goes through a promise and a thread hop. `importSeed` with `extractable: false` imports the key twice, once to read its public key and once to keep it private. `rawToDerEcdsa` is slower than `joseToDer` because V8 allocates a typed array over 64 bytes outside the JavaScript heap, and `joseToDer` instead slices a `Buffer` from Node's shared 8 KB pool.

<!-- bench:start -->
| | @portable/web-crypto | ecdsa-sig-formatter | @noble/hashes | @noble/curves | `crypto.subtle` by hand | `node:crypto` |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| SHA-256 of 1 KB | 27,900 | – | 136,000 | – | 28,900 | 429,000 |
| SHA-256 of 1 MB | 928 | – | 170 | – | 958 | – |
| HMAC-SHA256 of 1 KB | 18,500 | – | 84,700 | – | 18,400 | 271,000 |
| Derive 32 bytes with HKDF | 17,300 | – | 113,000 | – | 18,200 | 215,000 |
| Import an Ed25519 seed | 15,600 | – | – | 2,920 | 16,500 | – |
| Read the public key of a P-256 key | 20,500 | – | – | – | 19,000 | 1,240,000 |
| Convert a DER ECDSA signature to raw | 4,900,000 | 818,000 | – | 361,000 | – | – |
| Convert a raw ECDSA signature to DER | 1,620,000 | 2,250,000 | – | 253,000 | – | – |

Operations per second from `pnpm bench`, higher is better, in Node 24.22.0, on Intel(R) Xeon(R) Processor @ 2.10GHz (4 cores). A dash means the library has no equivalent.

| | @portable/web-crypto | ecdsa-sig-formatter | @noble/hashes | @noble/curves | `crypto.subtle` by hand | `node:crypto` |
| --- | --- | --- | --- | --- | --- | --- |
| Minified and gzipped | 2.7 kB | 1.7 kB | 3.4 kB | 20 kB | built in | built in |
| Runtime dependencies | 2 | 1 | 0 | 1 | – | – |
| Node built-ins used | none | `buffer` | none | none | none | Node only |
| TypeScript types | included | included | included | included | – | – |
| Version compared | – | 1.0.11 | 2.4.0 | 2.4.0 | – | – |

Sizes cover the imports in the usage example, or the equivalent imports of each library, bundled for the browser by `scripts/bundle-size.ts`. Runtime dependencies count every package installed with the published package. A library that uses Node built-ins needs polyfills in a browser and the `nodejs_compat` flag in Cloudflare Workers.
<!-- bench:end -->

- ecdsa-sig-formatter's `derToJose` and `joseToDer` take and return base64url text. `derToRawEcdsa` and `rawToDerEcdsa` take and return bytes, so encode and decode the base64url text JWS uses with [@portable/base64](../base64).
- ecdsa-sig-formatter takes the JWS `alg`, such as `'ES384'`. `derToRawEcdsa` takes `namedCurve` instead, and it defaults to `'P-256'`, so pass `'P-384'` or `'P-521'` for ES384 or ES512 signatures.
- `derToRawEcdsa` throws `WebCrypto.InvalidInputError` for a long-form length where the short form fits, such as `30 81 06` for a 6-byte SEQUENCE. ecdsa-sig-formatter's `derToJose` accepts it.
- `derToRawEcdsa` also rejects an INTEGER with a leading zero it does not need, an empty INTEGER or a negative INTEGER, which `derToJose` accepts.
- `derToRawEcdsa` rejects an INTEGER one byte longer than the curve allows, if its top byte is not zero. `derToJose` drops that byte and returns a different `r` or `s`.
- Strict DER gives each signature one encoding, so a verifier that deduplicates signatures or uses them as identifiers can't be given a second form of the same signature.
