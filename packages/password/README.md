# @portable/password

Hashes and verifies passwords with PBKDF2 on WebCrypto. Runs in browsers, Cloudflare Workers, Node 24+, Bun, and Deno.

Replaces the PBKDF2 use of `node:crypto`, [pbkdf2](https://www.npmjs.com/package/pbkdf2), and [pbkdf2-password](https://www.npmjs.com/package/pbkdf2-password), and hand-written `salt:hash` formats in app code.

```sh
npm install @portable/password
```

```ts
import * as Password from '@portable/password';

const stored = await Password.hash(password);
// '$pbkdf2-sha256$i=600000$jL2uY0lkKl3m0WbJ8a7SmA$7m0N...'

if (await Password.verify(password, stored)) {
  if (Password.needsRehash(stored)) {
    await saveHash(user, await Password.hash(password));
  }
}
```

`hash` derives a 32-byte PBKDF2-HMAC-SHA256 hash with a random 16-byte salt and 600,000 iterations ([OWASP's recommendation](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html#pbkdf2)).

It returns a [PHC string](https://github.com/P-H-C/phc-string-format/blob/master/phc-sf-spec.md) with the algorithm, iterations, salt, and hash, so you store one column and can raise the iterations later. The salt and hash are base64 without padding.

## API

| Function | Returns | Description |
| --- | --- | --- |
| `hash(password, options?)` | `Promise<string>` | Hashes a password with a new random salt. |
| `verify(password, stored, options?)` | `Promise<boolean>` | `true` if the password matches. Compares in constant time. |
| `needsRehash(stored, options?)` | `boolean` | `true` if `stored` uses fewer iterations than `options.iterations`, a digest other than SHA-256, a salt under 16 bytes, or a hash under 32 bytes. |

`password` is a `string` or a `Uint8Array`. A string is normalized to NFC and encoded as UTF-8, so `'café'` gives the same hash however the `é` was typed. Bytes are hashed as they are.

`verify` resolves to `false` for a wrong password and rejects for a malformed `stored` string. It reads:

- the PHC format `hash` writes: `$pbkdf2-sha256$i=600000$<salt>$<hash>`, with an optional `l=<length>` after the iterations, as Rust's pbkdf2 crate can write it;
- [passlib](https://passlib.readthedocs.io/en/stable/lib/passlib.hash.pbkdf2_digest.html)'s `pbkdf2_sha256`, `pbkdf2_sha512`, and `pbkdf2_sha1` (`$pbkdf2$`) formats.

The hash length is read from the stored string, so 20-byte and 64-byte hashes from other tools verify too. A stored hash with an empty salt verifies, but `needsRehash` returns `true` for it.

### Options

| Option | Functions | Default | Description |
| --- | --- | --- | --- |
| `iterations` | `hash`, `needsRehash` | `600000` | PBKDF2 iterations to write, or the minimum `needsRehash` accepts. Cloudflare Workers allows at most 100,000. |
| `maxBytes` | `hash`, `verify` | `4096` | Longest password, in UTF-8 bytes after normalization. `Infinity` turns the check off. |
| `signal` | `hash`, `verify` | | Rejects with `signal.reason` when aborted. A derivation that has started still runs to the end in the background. |

### Errors

| Error | Thrown when |
| --- | --- |
| `InvalidInputError` | `stored` is a malformed PBKDF2 hash, e.g. a missing field, iterations outside 1 to 2^32 - 1 or with a leading zero, invalid base64, padding, or an `l=` that doesn't match the hash length. |
| `UnsupportedError` | `stored` is another algorithm's hash, such as `$2b$` (bcrypt), `$argon2id$`, or `$scrypt$`. |
| `MaxBytesError` | The password is longer than `maxBytes`. Stores the limit in `maxBytes`. |

An invalid `iterations` or `maxBytes` option gives a `RangeError`.

## Cloudflare Workers

Deployed Workers reject PBKDF2 with more than 100,000 iterations, so `hash` and `verify` reject with a `NotSupportedError` `DOMException`. Local `wrangler dev` and Miniflare don't have this limit, so code that passes locally can fail once deployed.

On Workers, pass `iterations: 100_000` to both `hash` and `needsRehash`:

```ts
const options = { iterations: 100_000 };
const stored = await Password.hash(password, options);
Password.needsRehash(stored, options); // false
```

100,000 iterations makes a stolen hash six times cheaper to crack than OWASP's recommendation. If that's not enough, hash passwords in a separate service that can run 600,000 iterations or Argon2id.

Hashes with more than 100,000 iterations can't be verified on Workers.

## Why use this over node:crypto, pbkdf2, and pbkdf2-password

`node:crypto` and pbkdf2 only derive a key, so the salt, storage format, constant-time compare, and iteration upgrades are left to you. pbkdf2-password adds a salt, but defaults to 10,000 SHA-1 iterations and returns the salt and hash separately. This package does all of it with one string and runs where `node:crypto` doesn't.

- It hashes as fast as `node:crypto`'s `pbkdf2`, about 110 ms at 600,000 iterations, because both call OpenSSL.
- The stored string records the digest and iterations, so `needsRehash` tells you when to upgrade a hash and `verify` still reads old ones.
- The compare is constant time. A `===` on hex or base64 strings leaks how many leading characters matched.
- It writes the PHC format that Rust's pbkdf2 crate uses and also reads passlib's format, so it can share a users table with Rust and Python services.
- Passwords are normalized to NFC. passlib and `node:crypto` hash the code units as given, so the same password typed on two keyboards can fail to verify.
- A password over 4096 bytes is rejected with `MaxBytesError` before hashing, as in passlib.
- An unknown algorithm throws `UnsupportedError`. In browsers, pbkdf2 3.1.2 and earlier returned an all-zero key for unrecognized names such as `'SHA256'` (CVE-2025-6545).

Differences to check when you switch:

- To verify a salt and hash stored separately, build a PHC string with the digest and iterations they were made with, and drop the base64 padding. For pbkdf2-password's defaults (SHA-1, 10,000 iterations) that is `$pbkdf2$i=10000$<salt>$<hash>`. Use `$pbkdf2-sha256$` for SHA-256 and `$pbkdf2-sha512$` for SHA-512. A salt stored as text goes in as the base64 of its UTF-8 bytes. `needsRehash` returns `true` for these strings, so rehash on the next login.
- If a hash was made from a password in another normalization form, pass the original bytes as a `Uint8Array` to verify it.
- passlib can't read the `i=` form that `hash` writes. If Python code still reads the table, it has to split the string on `$` and call `hashlib.pbkdf2_hmac` itself.

### Other algorithms

WebCrypto has no password hash other than PBKDF2, so `verify` rejects bcrypt, scrypt, and Argon2 hashes with `UnsupportedError`. To migrate, verify them with another library and rehash on the next login:

```ts
async function check(user: User, password: string): Promise<boolean> {
  try {
    return await Password.verify(password, user.hash);
  } catch (error) {
    if (!(error instanceof Password.UnsupportedError)) {
      throw error;
    }
    if (!(await verifyLegacy(password, user.hash))) {
      return false;
    }
    await saveHash(user, await Password.hash(password));
    return true;
  }
}
```

[@noble/hashes](https://github.com/paulmillr/noble-hashes) (`argon2id` and `scrypt` in JavaScript) and [hash-wasm](https://github.com/Daninet/hash-wasm) (Argon2, scrypt, and bcrypt in WebAssembly) run in every runtime this package does.

Argon2id is stronger than PBKDF2. If you already use bcryptjs or the argon2 package and its runtime fits, keep using it.

<!-- bench:start -->
<table>
<thead><tr><th align="left">Library</th><th align="right">Ops/s</th><th align="left">Relative</th><th></th></tr></thead>
<tbody>
<tr><th colspan="4" align="left">Hash a password with 600,000 iterations</th></tr>
<tr><td>pbkdf2</td><td align="right">9.26</td><td>same</td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="160" height="12" alt="" /></td></tr>
<tr><td><code>node:crypto</code></td><td align="right">9.23</td><td>same</td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="159" height="12" alt="" /></td></tr>
<tr><td><code>crypto.subtle</code></td><td align="right">9.23</td><td>same</td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="159" height="12" alt="" /></td></tr>
<tr><td>@portable/password</td><td align="right">8.88</td><td></td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="153" height="12" alt="" /></td></tr>
<tr><td>pbkdf2-password</td><td align="right">8.69</td><td>same</td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="150" height="12" alt="" /></td></tr>
<tr><th colspan="4" align="left">Verify a password with 600,000 iterations</th></tr>
<tr><td>@portable/password</td><td align="right">9.33</td><td></td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="160" height="12" alt="" /></td></tr>
<tr><td><code>node:crypto</code></td><td align="right">8.95</td><td>same</td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="153" height="12" alt="" /></td></tr>
<tr><th colspan="4" align="left">Check whether a stored hash needs a rehash</th></tr>
<tr><td>@portable/password</td><td align="right">603,000</td><td></td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="160" height="12" alt="" /></td></tr>
</tbody>
</table>

Operations per second from `pnpm bench`, higher is better, in Node 24.22.0, on Intel(R) Xeon(R) Processor @ 2.10GHz (4 cores). Each benchmark lists only the libraries that can do the same work, fastest first. The relative speed compares each library with @portable/password, and the bars are scaled to the fastest library.

| Library | Version | Minified and gzipped | Runtime dependencies | Node built-ins | TypeScript types |
| --- | --- | ---: | ---: | --- | --- |
| @portable/password | – | 4.2 kB | 5 | none | included |
| pbkdf2 | 3.1.7 | 22 kB | 43 | `buffer`, `events`, `util` | included |
| pbkdf2-password | 1.2.1 | 1.5 kB | 2 | `Buffer`, `crypto` | none |
| `node:crypto` | – | built in | – | Node only | – |
| `crypto.subtle` | – | built in | – | none | – |

Sizes cover the imports in the usage example, or the equivalent imports of each library, bundled for the browser by `scripts/bundle-size.ts`. Runtime dependencies count every package installed with the published package. A library that uses Node built-ins needs polyfills in a browser and the `nodejs_compat` flag in Cloudflare Workers.
<!-- bench:end -->
