# @portable/crypto

Bytes-in, bytes-out helpers over `crypto.subtle`: `digest`, `hmac` and `hkdf`, Ed25519 and X25519 keys from 32-byte seeds, the public key of a private key, and ECDSA signatures converted between DER and raw `r || s`. It contains no cryptography of its own. Runs in browsers, Cloudflare Workers, Deno, Bun and Node 24+.

Replaces [ecdsa-sig-formatter](https://www.npmjs.com/package/ecdsa-sig-formatter) and the WebCrypto wrappers that apps write by hand.

```sh
npm install @portable/crypto
```

```ts
import * as Crypto from '@portable/crypto'

const hash = await Crypto.digest('SHA-256', 'hello')
const mac = await Crypto.hmac('SHA-256', 'whsec_secret', body)
const key = await Crypto.hkdf('SHA-256', sharedSecret, { info: 'my app v1', length: 32 })

const { privateKey, publicKey } = await Crypto.importSeed('Ed25519', seed)

const raw = Crypto.derToRawEcdsa(assertion.signature)
await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, credentialKey, raw, signedData)
```

## API

Every function that takes bytes takes any `Uint8Array`, including a `subarray` or a Node `Buffer`, and reads only the bytes the view covers. Every result is a `Uint8Array<ArrayBuffer>` that `crypto.subtle` accepts as a `BufferSource` without a copy. `Hash` is `'SHA-1' | 'SHA-256' | 'SHA-384' | 'SHA-512'`.

| Function | Returns | Description |
| --- | --- | --- |
| `digest(hash, data, options?)` | `Promise<Uint8Array>` | Hashes `data`. A string is hashed as UTF-8. |
| `hmac(hash, key, data, options?)` | `Promise<Uint8Array>` | HMAC (RFC 2104). `key` and `data` are bytes or UTF-8 strings. An empty key is accepted. |
| `hkdf(hash, key, options?)` | `Promise<Uint8Array>` | HKDF (RFC 5869) extract and expand. |
| `importSeed(algorithm, seed, options?)` | `Promise<CryptoKeyPair>` | Imports a 32-byte `'Ed25519'` or `'X25519'` private key and returns it with its public key. |
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
| `namedCurve` | `derToRawEcdsa` | `'P-256'` | `'P-256'`, `'P-384'` or `'P-521'`. It sets the width of `r` and `s` in the output. |

`Crypto.InvalidInputError` is thrown for malformed DER, a raw signature or seed of the wrong length, and a key that is not an extractable private key. Errors from `crypto.subtle` itself, such as an HKDF `length` over the limit, are thrown unchanged.

## Why use this over hand-written WebCrypto calls

Each helper replaces a few lines that apps write by hand, and handles a trap those lines often miss.

- In TypeScript 5.9 and later, a plain `Uint8Array` is `Uint8Array<ArrayBufferLike>`, which `crypto.subtle` doesn't accept as a `BufferSource`. Hand-written code adds `.slice()` or a cast at every call. These functions take any `Uint8Array`, copy it only when its buffer is not an `ArrayBuffer` (a `SharedArrayBuffer`, for example), and return `Uint8Array<ArrayBuffer>`.
- `crypto.subtle.digest(hash, bytes.buffer)` hashes the whole buffer, not the view. Taking a `Uint8Array` rules that out.
- WebCrypto refuses an empty HMAC key. HMAC pads the key with zero bytes, so `hmac` uses a single zero byte, which gives the result RFC 2104 defines.
- WebCrypto imports an Ed25519 or X25519 private key only as PKCS #8 or JWK, and has no call that returns the public key of a private key. `importSeed` adds the 16-byte PKCS #8 header and reads the public key back through a JWK export.
- WebAuthn and OpenSSL produce DER ECDSA signatures, and `crypto.subtle.verify` and JWS take raw `r || s`.

The helpers cost what the `crypto.subtle` calls under them cost. On Node, synchronous hashing in node:crypto or @noble/hashes is 5 to 10 times faster than any `crypto.subtle` call on small input, because each WebCrypto call goes through a promise and a thread hop. A non-extractable `importSeed` imports the key twice, once to read its public key and once to keep it private. `rawToDerEcdsa` is slower than `joseToDer` because V8 allocates a typed array over 64 bytes outside the JavaScript heap, and `joseToDer` instead slices a `Buffer` from Node's shared 8 KB pool.

<!-- bench:start -->
<!-- bench:end -->

## Migrating from ecdsa-sig-formatter

| ecdsa-sig-formatter | @portable/crypto |
| --- | --- |
| `derToJose(der, 'ES256')` | `Base64.encode(Crypto.derToRawEcdsa(der), { alphabet: 'base64url', omitPadding: true })` |
| `derToJose(der, 'ES384')` | `Crypto.derToRawEcdsa(der, { namedCurve: 'P-384' })`, then base64url |
| `derToJose(der, 'ES512')` | `Crypto.derToRawEcdsa(der, { namedCurve: 'P-521' })`, then base64url |
| `joseToDer(jose, alg)` | `Crypto.rawToDerEcdsa(Base64.decode(jose, { alphabet: 'base64url' }))` |

The functions here take and return bytes. Use [@portable/base64](../base64) for the base64url text JWS uses.

`derToRawEcdsa` rejects input that `derToJose` accepts:

- a long-form length where the short form fits, such as `30 81 06` for a 6-byte SEQUENCE;
- an INTEGER with a leading zero it does not need, an empty INTEGER, or a negative INTEGER;
- an INTEGER one byte longer than the curve allows whose top byte is not zero. `derToJose` drops that byte and returns a different `r` or `s`.

Strict DER means a signature has one encoding, so a verifier that deduplicates signatures or uses them as identifiers can't be given a second form of the same signature.
