# @portable/password

Hashes and verifies passwords with PBKDF2 on WebCrypto. Runs in browsers, Cloudflare Workers, Deno, Bun and Node 24+.

Replaces the PBKDF2 use of `node:crypto`, [pbkdf2](https://www.npmjs.com/package/pbkdf2) and [pbkdf2-password](https://www.npmjs.com/package/pbkdf2-password), and hand-written `salt:hash` formats in app code.

```sh
npm install @portable/password
```

```ts
import * as Password from '@portable/password'

const stored = await Password.hash(password)
// '$pbkdf2-sha256$i=600000$jL2uY0lkKl3m0WbJ8a7SmA$7m0N...'

if (await Password.verify(password, stored)) {
  if (Password.needsRehash(stored)) await saveHash(user, await Password.hash(password))
}
```

`hash` derives a 32-byte PBKDF2-HMAC-SHA256 hash with `crypto.subtle.deriveBits`, 600,000 iterations ([OWASP's recommendation](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html#pbkdf2)) and a random 16-byte salt. It returns a [PHC string](https://github.com/P-H-C/phc-string-format/blob/master/phc-sf-spec.md) that stores the algorithm, iterations, salt and hash, so you store one column and can raise the iterations later. The salt and hash are base64 without padding.

## API

| Function | Returns | Description |
| --- | --- | --- |
| `hash(password, options?)` | `Promise<string>` | Hashes a password with a new random salt. |
| `verify(password, stored, options?)` | `Promise<boolean>` | `true` if the password matches. Compares in constant time. |
| `needsRehash(stored, options?)` | `boolean` | `true` if `stored` uses fewer iterations than `options.iterations`, a digest other than SHA-256, a salt under 16 bytes or a hash under 32 bytes. |

`password` is a `string` or its bytes as a `Uint8Array`. A string is normalized to NFC before it is encoded as UTF-8, so `'café'` typed as one code point or as `e` plus a combining accent gives the same hash. Bytes are hashed as they are.

`verify` returns `false` for a wrong password and throws for a bad `stored` string. It reads:

- the PHC format `hash` writes: `$pbkdf2-sha256$i=600000$<salt>$<hash>`, with an optional `l=<length>` after the iterations, as Rust's `pbkdf2` crate can write it;
- [passlib](https://passlib.readthedocs.io/en/stable/lib/passlib.hash.pbkdf2_digest.html)'s `pbkdf2_sha256`, `pbkdf2_sha512` and `pbkdf2_sha1` (`$pbkdf2$`), which write the iterations without `i=` and `.` instead of `+`.

The hash length comes from the stored string, so a 20-byte or 64-byte hash from another tool verifies too.

### Options

| Option | Functions | Default | Description |
| --- | --- | --- | --- |
| `iterations` | `hash`, `needsRehash` | `600000` | PBKDF2 iterations to write, or the minimum `needsRehash` accepts. Cloudflare Workers allows at most 100,000. |
| `maxBytes` | `hash`, `verify` | `4096` | Longest password, in UTF-8 bytes after normalization. `Infinity` turns the check off. |
| `signal` | `hash`, `verify` | | Rejects with `signal.reason` when aborted. WebCrypto can't stop a derivation that has started, so it runs to the end in the background. |

### Errors

| Error | Thrown when |
| --- | --- |
| `InvalidInputError` | `stored` is not a well-formed PBKDF2 hash: a missing field, iterations outside 1 to 2^32 - 1 or with a leading zero, a character outside base64, or padding. |
| `UnsupportedError` | `stored` is another algorithm's hash, such as `$2b$` (bcrypt), `$argon2id$` or `$scrypt$`. |
| `MaxBytesError` | The password is longer than `maxBytes`. The error's `maxBytes` property holds the limit. |

A bad `iterations` or `maxBytes` option throws a `RangeError`.

## Cloudflare Workers

Workers rejects PBKDF2 with more than 100,000 iterations: `deriveBits` throws a `NotSupportedError` ("Pbkdf2 failed: iteration counts above 100000 are not supported"). The limit is the default in workerd's `IsolateLimitEnforcer`, and the comment there says it guards against a request that would run long enough to restart the process. Local `wrangler dev` and Miniflare run workerd without the limit: 600,000 iterations worked there in 550 ms, so code that passes locally fails once deployed.

On Workers, hash with `iterations: 100_000` and check with the same value:

```ts
const options = { iterations: 100_000 }
const stored = await Password.hash(password, options)
Password.needsRehash(stored, options) // false
```

100,000 iterations is a sixth of OWASP's recommendation, so a stolen hash costs an attacker six times less to crack. If that's not enough, hash passwords in a service that can run 600,000 iterations or Argon2id, and keep the Worker for the rest. A hash written elsewhere with more than 100,000 iterations can't be verified on Workers at all.

## Why use this over node:crypto, pbkdf2 and pbkdf2-password

`node:crypto` and pbkdf2 give you a key derivation function, and the rest is up to you: a salt, a storage format, a constant-time compare, a plan for raising the iterations. pbkdf2-password adds a salt but defaults to 10,000 SHA-1 iterations and returns the salt and hash separately, and none of them compare. This package does all of it with one string and runs where `node:crypto` doesn't.

- It hashes at the same speed as `node:crypto`'s `pbkdf2`: about 620 ms per hash at 600,000 iterations for both on the benchmark machine, because both call OpenSSL. `verify` measured the same as `pbkdf2` plus `timingSafeEqual`.
- The stored string records the digest and iterations, so `needsRehash` can tell you when to upgrade a hash and `verify` keeps reading old ones.
- The compare is constant time. A `===` on hex or base64 strings, common in hand-written code, leaks how many leading characters matched.
- The string format is the one passlib and Rust's `pbkdf2` crate use, so Python and Rust services can share a users table with a JavaScript one.
- Passwords are normalized to NFC. passlib and `node:crypto` hash the code units they're given, so the same password typed on two keyboards can fail to verify.
- A password over 4096 bytes is rejected with `MaxBytesError`, as in passlib, before any hashing.
- An unknown algorithm name throws `UnsupportedError`. pbkdf2 3.1.2 and earlier, in browsers, returned an all-zero key for algorithm names it didn't recognize, such as `'SHA256'`, so every password gave the same key (CVE-2025-6545).

### Other algorithms

WebCrypto has PBKDF2 and no other password hash, so this package can't verify bcrypt, scrypt or Argon2 hashes. Node 24 has an experimental `Argon2id` in `crypto.subtle`, but browsers and Workers don't. For those hashes, `verify` throws `UnsupportedError`, and you can verify them with another library and rehash on the next login:

```ts
async function check(user: User, password: string): Promise<boolean> {
  try {
    return await Password.verify(password, user.hash)
  } catch (error) {
    if (!(error instanceof Password.UnsupportedError)) throw error
    if (!(await verifyLegacy(password, user.hash))) return false
    await saveHash(user, await Password.hash(password))
    return true
  }
}
```

[@noble/hashes](https://github.com/paulmillr/noble-hashes) has `argon2id` and `scrypt` in plain JavaScript, and [hash-wasm](https://github.com/Daninet/hash-wasm) has Argon2, scrypt and bcrypt in WebAssembly. Both run in every runtime this package does. bcryptjs and the `argon2` package are different algorithms, not PBKDF2. Keep using them if you're already on them and their runtime fits. Argon2id is the stronger choice where you can run it, and PBKDF2 is the one WebCrypto can run everywhere.

## Migrating

| Before | @portable/password |
| --- | --- |
| `crypto.pbkdf2Sync(password, salt, 600000, 32, 'sha256')` and storing salt and hash | `await Password.hash(password)` |
| `crypto.timingSafeEqual(crypto.pbkdf2Sync(password, salt, ...), hash)` | `await Password.verify(password, stored)` |
| `pbkdf2.pbkdf2(password, salt, iterations, keylen, digest, callback)` | `await Password.hash(password, { iterations })` |
| `hasher({ password }, (err, pass, salt, hash) => ...)` (pbkdf2-password) | `await Password.hash(password)` |
| `hasher({ password, salt }, ...)` and comparing `hash` | `await Password.verify(password, stored)` |
| passlib `pbkdf2_sha256.hash(password)` | `await Password.hash(password)` |
| passlib `pbkdf2_sha256.verify(password, stored)` | `await Password.verify(password, stored)` |
| passlib `CryptContext.needs_update(stored)` | `Password.needsRehash(stored)` |

To keep existing hashes, build a PHC string from the salt and hash you stored, with the digest and iterations they were made with. For pbkdf2-password's defaults (SHA-1, 10,000 iterations, base64 salt and hash):

```ts
const unpad = (b64: string) => b64.replace(/=+$/, '')
const stored = `$pbkdf2$i=10000$${unpad(user.salt)}$${unpad(user.hash)}`
await Password.verify(password, stored) // then rehash, since needsRehash(stored) is true
```

The identifier is `$pbkdf2$` for SHA-1, `$pbkdf2-sha256$` and `$pbkdf2-sha512$`. Salts that were stored as text, rather than as random bytes, go in as the base64 of their UTF-8 bytes.

Two behaviors differ from these libraries:

- String passwords are normalized to NFC. A hash made elsewhere from a password in another normalization form verifies only if you pass the original bytes as a `Uint8Array`. Most keyboards produce NFC, so this rarely matters.
- passlib can't read the `i=` form that `hash` writes. `verify` reads passlib's hashes, so moving from passlib works, but a Python service that keeps reading the table has to split the string on `$` and call `hashlib.pbkdf2_hmac` itself.
