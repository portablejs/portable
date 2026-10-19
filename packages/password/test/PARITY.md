# Test parity

Upstream suites:

- [pbkdf2 3.1.7](https://github.com/browserify/pbkdf2) `test/index.js` and `test/fixtures.json`. The fixtures are copied to `fixtures/pbkdf2.json` (MIT, Daniel Cousens).
- [pbkdf2-password 1.2.1](https://github.com/mcollina/pbkdf2-password) `test.js` (MIT, Matteo Collina).
- Node.js 24 `test/parallel/test-crypto-pbkdf2.js`, for `node:crypto`'s `pbkdf2` and `pbkdf2Sync`.
- [passlib 1.7.4](https://foss.heptapod.net/python-libs/passlib) `passlib/tests/test_handlers_pbkdf2.py` and the generic `HandlerCase` tests in `passlib/tests/utils.py` that apply to `pbkdf2_sha256` (BSD). The known hashes are copied into `Password.conformance.ts`.
- RFC 6070 §2 (PBKDF2-HMAC-SHA1) and RFC 7914 §11 (PBKDF2-HMAC-SHA256) test vectors.

Test names below are `describe > test` in `Password.conformance.ts` unless another file is named. Vectors are checked by building the PHC string for the expected output and calling `verify`, because `hash` always picks a random salt.

## RFC vectors

| Vector | Covered by | Notes |
| --- | --- | --- |
| RFC 6070 1 to 3, 5, 6 | `RFC 6070 (PBKDF2-HMAC-SHA1) > ...` | Each also checks that a wrong password gives `false`. |
| RFC 6070 4 (c = 16,777,216) | `Password.test.ts > RFC 6070 "password", "salt", c=16777216` | Node only, because it takes seconds. |
| RFC 7914 §11, both vectors | `RFC 7914 §11 (PBKDF2-HMAC-SHA256) > ...` | 64-byte hashes. |

## pbkdf2

| Upstream test | Covered by | Notes |
| --- | --- | --- |
| defaults to sha1 and handles buffers | `pbkdf2 fixtures > #0 sha1, c=1, dkLen=32` | `hash` always writes SHA-256. SHA-1 is read through the `$pbkdf2$` identifier. |
| should throw if no callback is provided | skipped | Promises, no callbacks. |
| should throw if the password is not a string or an ArrayBuffer | skipped | The TypeScript type is `string \| Uint8Array`. |
| should throw if the salt is not a string or an ArrayBuffer | skipped | The salt is generated or read from the stored string. |
| sha1, sha256, sha512: every valid fixture, sync and async | `pbkdf2 fixtures > #<n> <digest>, ...` | All 17 fixtures for the three digests. Int32Array and Float64Array keys are passed as the `Uint8Array` of their bytes, which is what Node hashes. |
| sha224, sha384, ripemd160 fixtures | skipped | No PHC identifier exists for them, so `verify` throws `UnsupportedError` for `$pbkdf2-sha384$`. |
| Unicode salt, no truncation | `pbkdf2 fixtures > #8 ...` | The hex form of the same salt is in the fixtures. |
| invalid fixtures (NaN, negative iterations, bad key length) | `hash > rejects iterations outside 1 to 2^32 - 1`, `stored hash format > throws InvalidInputError for zero iterations`, `... non-numeric iterations`, `... negative iterations`, `... empty hash` | The key length is the stored hash's length, so a bad one is a malformed string. |
| does not return all zeroes for any algorithm | `stored hash format > throws UnsupportedError for a SHA-384 PBKDF2 hash`, `... uppercase identifier` | Names other than our three identifiers throw instead of hashing. |
| coerces `-0` keylen to `+0` (GHSA-xcx4-h4w9-hqq4) | `stored hash format > throws InvalidInputError for empty hash` | There is no key length argument to pass `-0` to. |
| long passwords are hashed once, not per iteration (GHSA-477h-4r7f-fvrx) | `verify > verifies a password longer than the HMAC block as its SHA-256 digest`, `Password.oracle.test.ts > hash matches node:crypto pbkdf2Sync > passwords around the HMAC block size, as bytes` | The timing half is not ported. WebCrypto implementations hash the key once in native code. |

## pbkdf2-password

| Upstream test | Covered by | Notes |
| --- | --- | --- |
| should generate an hash from a password twice | `verify > ...`, `hash > uses a new salt every time` | There is no salt option. `verify` checks that the same password and salt give the same hash. |
| should generate a password if one is not present | skipped | Out of scope. Use `crypto.getRandomValues` or `@portable/random`. |
| should generate an hash from a password twice (known salt and hash) | `pbkdf2-password > verifies a known hash once its salt and hash are in a PHC string` | Also `Password.oracle.test.ts > verify accepts a pbkdf2-password hash` with a fresh hash. |

## node:crypto (test-crypto-pbkdf2.js)

| Upstream test | Covered by | Notes |
| --- | --- | --- |
| RFC 6070 vectors with SHA-256 (20, 25 and 16 bytes) | `pbkdf2 fixtures`, `Password.oracle.test.ts > verify accepts what node:crypto and pbkdf2 compute` | The oracle test verifies random lengths from 1 to 100 bytes for all three digests. |
| `'password', 'salt', 32, 32` | `Password.oracle.test.ts > hash matches node:crypto pbkdf2Sync` | |
| missing callback throws | skipped | Promises. |
| iterations -1, 0, 2147483648 throw | `hash > rejects iterations outside 1 to 2^32 - 1` | We accept up to 2^32 - 1, passlib's limit, so 2147483648 is allowed. |
| keylen not a number, out of range | skipped | No key length argument. |
| empty password and salt (nodejs/node#8571) | `hash > hashes an empty password`, `stored hash format > reads an empty salt` | |
| missing or null digest | skipped | No digest argument. |
| password or salt of a wrong type | skipped | TypeScript types. |
| iterations of a wrong type | `hash > rejects iterations outside 1 to 2^32 - 1` | `NaN` and `1.5`. |
| any TypedArray works for password and salt | `pbkdf2 fixtures` | Only `Uint8Array`. Other views are passed as their bytes. |
| invalid digest `md55`, `%` | `stored hash format > throws UnsupportedError for ...` | |
| every digest from `getHashes()` | skipped | SHA-1, SHA-256 and SHA-512 only. |

## passlib

| Upstream test | Covered by | Notes |
| --- | --- | --- |
| `pbkdf2_sha1_test` known hashes | `passlib > pbkdf2_sha1 known hash of ...` | |
| `pbkdf2_sha256_test` known hashes | `passlib > pbkdf2_sha256 known hash of ...` | |
| `pbkdf2_sha512_test` known hashes | `passlib > pbkdf2_sha512 known hash of ...` | |
| `pbkdf2_sha1_test` malformed: zero-padded rounds, empty rounds, too many fields | `stored hash format > throws InvalidInputError for zero-padded rounds (passlib)`, `... empty rounds (passlib)`, `... too many fields (passlib)` | |
| `ldap_pbkdf2_test` | skipped | The `{PBKDF2-SHA256}` LDAP prefix is not read. Strip it and prepend `$pbkdf2-sha256$`. |
| `atlassian_pbkdf2_sha1_test`, `cta_pbkdf2_sha1_test`, `dlitz_pbkdf2_sha1_test`, `grub_pbkdf2_sha512_test` | skipped | Other string formats for PBKDF2. Rebuild them as PHC strings to verify them. |
| `scram_test` | skipped | SCRAM is an authentication protocol, not a stored password hash. |
| `test_01_required_attributes`, `test_02_*`, `test_05_backends`, `test_10_optional_salt_attributes`, `test_20_optional_rounds_attributes`, `test_30_HasManyIdents`, `test_has_many_idents_using`, `test_disable_and_enable` | skipped | passlib's handler class API. |
| `test_03_hash_workflow`, `test_03_legacy_hash_workflow` | `hash > writes PBKDF2-SHA256 ...`, `verify > returns false for a wrong password` | |
| `test_04_hash_types` | `verify > accepts the bytes of a password` | |
| `test_11_unique_salt` | `hash > uses a new salt every time` | |
| `test_12_min_salt_size`, `test_13_max_salt_size`, `test_14_salt_chars`, `test_15_salt_type`, `test_using_salt_size` | skipped | No salt options. The salt is always 16 random bytes. |
| `test_21_min_rounds`, `test_21b_max_rounds` | `hash > rejects iterations outside 1 to 2^32 - 1`, `stored hash format > throws InvalidInputError for iterations above 2^32 - 1` | |
| `test_has_rounds_using_*` (min, max, default, rounds) | `hash > uses the given iterations`, `needsRehash > compares iterations with the given minimum` | No `vary_rounds`. |
| `test_has_rounds_using_and_needs_update` | `needsRehash > ...` | |
| `test_truncate_error_setting`, `test_secret_wo_truncate_size`, `test_secret_w_truncate_size` | `verify > uses every byte of a long password` | PBKDF2 never truncates, unlike bcrypt's 72 bytes. |
| `test_61_secret_case_sensitive` | `verify > is case sensitive` | |
| `test_62_secret_border` | skipped | TypeScript types. |
| `test_63_large_secret` | `maxBytes > accepts 4096 bytes by default and rejects more` | Same 4096-byte default as passlib's `MAX_PASSWORD_SIZE`. |
| `test_64_forbidden_chars` | `RFC 6070 (PBKDF2-HMAC-SHA1) > "pass\u0000word", ...` | No forbidden characters. NUL is hashed like any other character. |
| `test_70_hashes`, `test_71_alternates` | `passlib > ...` | |
| `test_72_configs` | skipped | No config strings without a hash. |
| `test_73_unidentified`, `test_74_malformed` | `stored hash format > throws InvalidInputError for ...` | |
| `test_75_foreign` | `stored hash format > throws UnsupportedError for ...` | bcrypt, Argon2id, scrypt, SHA-512 crypt. |
| `test_76_hash_border` | `stored hash format > throws InvalidInputError for empty string`, `... plain text` | Non-string hashes are TypeScript errors. |
| `test_70_parsehash`, `test_71_parsehash_results` | skipped | No parse API. |
| `test_77_fuzz_input`, `test_78_fuzz_threading` | `Password.oracle.test.ts > hash matches node:crypto pbkdf2Sync > random passwords, seed <n>` | 100 random Unicode passwords, including lone surrogates. No threads in JavaScript. |

## Known upstream issues

| Issue | How we differ | Test |
| --- | --- | --- |
| pbkdf2 3.1.2 and earlier returned a zero-filled key in browsers for unrecognized algorithm names such as `SHA256` (CVE-2025-6545, GHSA-h7cp-r72f-jxh6). | Only three exact identifiers are accepted, and anything else throws. | `stored hash format > throws UnsupportedError for a SHA-384 PBKDF2 hash`, `... InvalidInputError for uppercase identifier` |
| pbkdf2 aborted the process on a `-0` key length (GHSA-xcx4-h4w9-hqq4). | The length comes from the stored hash, and an empty hash is malformed. | `stored hash format > throws InvalidInputError for empty hash` |
| pbkdf2 rehashed long passwords on every iteration (GHSA-477h-4r7f-fvrx). | WebCrypto hashes the key once. | `verify > verifies a password longer than the HMAC block as its SHA-256 digest` |
| pbkdf2-password defaults to 10,000 SHA-1 iterations and returns the salt and hash for the caller to store and compare. | One string with the algorithm and iterations, 600,000 SHA-256 iterations, and a constant-time `verify`. `needsRehash` flags pbkdf2-password hashes. | `pbkdf2-password > ...` |
| passlib and `node:crypto` hash a string's code units as given, so the composed and decomposed forms of a password give different hashes. | String passwords are normalized to NFC, and bytes are hashed as given. | `NFC normalization > ...` |
| passlib's `pbkdf2_sha256` can't read the PHC `i=` form. | `verify` reads both forms. | `stored hash format > reads the PHC format ...`, `... reads passlib's format ...` |
| Cloudflare Workers rejects more than 100,000 PBKDF2 iterations in production, but local workerd (`wrangler dev`, Miniflare) doesn't. | Documented in the README with the setting to use. | None. There is no Workers test project yet. |
