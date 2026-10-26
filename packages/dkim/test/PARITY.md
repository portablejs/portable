# Test parity

Upstream suites:

- mailauth 7.3.0's [`test/dkim/`](https://github.com/postalsys/mailauth/tree/master/test/dkim) and the reference signer in `test/helpers/dkim-reference.js`.
- nodemailer 10.1's [`test/dkim/`](https://github.com/nodemailer/nodemailer/tree/master/test/dkim).

`utils.ts` ports mailauth's reference signer and verifier to WebCrypto. They are written from the RFCs and share no code with the package, and the signer builds a signature from a literal tag list, so a test can sign with any tags, including invalid ones. The ported tests are in `verify.conformance.ts`, `sign.conformance.ts`, and `canonicalization.conformance.ts`, which run in Node and Chromium. `dkim.oracle.test.ts` runs in Node and checks, on two fixture messages and 60 generated ones, that:

- signatures made here pass in mailauth's strict mode, for all four canonicalizations, with RSA and Ed25519 keys;
- signatures made by mailauth (RSA and Ed25519) and by nodemailer pass here, and `h=` and `bh=` match ours;
- after each of 12 changes to a signed message, such as folding a header, adding a body line or smuggling a line after From, mailauth's strict mode, and `verify` agree on which signatures still pass.

mailauth has a lenient default mode and a `strict: true` mode that follows RFC 6376, RFC 8301, and RFC 8463. `verify` has only RFC behavior, so ported verification cases expect the strict-mode result. The result codes differ in one way throughout: mailauth gives `neutral` for problems with the key record, and `verify` gives `permerror`, as RFC 8601 section 2.7.1 describes (see "Deliberate differences").

Fixtures, copied with their licenses (`mailauth.LICENSE`, MIT, Postal Systems OÜ; `nodemailer.LICENSE`, MIT-0, Andris Reinman):

- From mailauth: `private-rsa.pem.txt`, `public-rsa.pem.txt`, `private-small.pem.txt`, `public-small.pem.txt`, `private-ed25519.pem.txt`, `public-ed25519.pem.txt` (renamed from `.pem`, because Vite refuses to serve `.pem` and `.key` files to the browser tests), `message1.eml`, and from `test/dkim/ec/fixtures/` the RFC 8463 example as `rfc8463-signed.eml`, `rfc8463-dns.json`, `rfc8463-ed25519.key.txt`, and `rfc8463-rsa.key.txt`.
- From nodemailer: `message1.eml` as `nodemailer-message1.eml`.

## mailauth `verify-rfc-compliance-test.js`

Every case of the `cases` table is in `verify.conformance.ts` under "RFC compliance cases", with the same title. They all match the strict-mode result except these:

| Upstream case | mailauth strict | Here | Why |
| --- | --- | --- | --- |
| a signature with a hash the key h= tag does not list | neutral | permerror | Key record problem. |
| a key that is not meant for email | neutral | permerror | Key record problem. |
| a subdomain i= with a key that has t=s | neutral | permerror | Key record problem. |
| a key with a duplicate tag | neutral, `invalid public key` | permerror, `key syntax error` | A duplicate tag makes the record invalid (RFC 6376 section 3.2), whatever `p=` contains. |
| a key with v= that is not the first tag, v=dkim1, v=DKIM 1 | neutral | permerror | Key record problem. |
| an ed25519 key without k= | neutral, `unknown key type` | permerror, `inappropriate key algorithm` | `k=` defaults to `rsa`, so the key type is known and doesn't match `a=`. |
| an rsa signature with an ed25519 key, an ed25519-sha256 signature with an RSA key | neutral | permerror | Key record problem. |
| an ed25519 key published as SubjectPublicKeyInfo | neutral | permerror | Key record problem. |
| an expired signature | neutral, `expired` | neutral, `signature expired` | |
| a key lookup that fails with EBADNAME | neutral, `no key` | permerror, `no key` | |
| a header hash mismatch | fail, `bad signature` | fail, `signature did not verify` | |
| a hexadecimal l= | neutral, `signature syntax error` | same | |

The other `describe` blocks:

| Upstream test | Here |
| --- | --- |
| A d= that is not a host name (7 separators) | `d= values that are not host names` |
| Alignment with the From header field | Not applicable. Alignment is DMARC's job and belongs to @portable/dmarc. |
| EAI: look up the key of a U-label d= under its A-label | `EAI (RFC 8616)` |
| EAI: report A-labels in strict mode | Same test. The result always contains A-labels. |
| rejectRsaSha1 (2 tests) | rsa-sha1 is always `policy`, as the rsa-sha1 cases check. |
| Body length: report the content after l=0 as unsigned | `body length (l=)` |
| Body length: an l= larger than the canonicalized body | Same, with the reason `l= is longer than the body`. mailauth reports `signature syntax error` without looking up the key. `verify` looks up keys while it reads the body, and checks `l=` after hashing it. |
| Body length: an l= equal to the body length | Same |
| Body length: content after l= in pieces | Same |
| Header section: a leading empty line | `header section` |
| Header section: an LF right after a CRLF | Same |
| From extraction (2 tests) | Not applicable. `verify` doesn't parse From. |
| ARC-Message-Signature (3 tests) | Only "not read as a DKIM-Signature" applies, in `header section`. ARC is @portable/arc's job. |

## mailauth `sign-rfc-compliance-test.js`

| Upstream test | Here |
| --- | --- |
| Failed signing output (6 tests) | `sign` throws instead of returning `errors`, so there is no partial output. Missing keys, domains, and selectors are in `options` and `private keys`. ARC and `DkimSignStream` don't apply. |
| Sign with rsa-sha1 (default mode) | rsa-sha1 is not offered: the key type sets `a=`. |
| Sign with an RSA key under 1024 bits (default mode) | Refused with a `RangeError`, as strict mode does. |
| Refuse ed25519-sha1 | Not applicable, there is no algorithm option. |
| Sign with ed25519-sha256 | `the signature field` |
| Expiration equal to, before or less than a second after the signing time | `options`, refused as in strict mode |
| Expiration after the signing time | `the signature field` |
| t= before 1970 or with more than 12 digits | `options`, refused as in strict mode |
| d= and s= with a semicolon, line break or space, missing | `options` |
| d= with a trailing dot, single label d=, s= with an underscore | `options`, refused as in strict mode |
| Convert U-labels to lower case A-labels | `options` |
| Unknown canonicalization (4 values) | `options`. Only the four `header/body` pairs are accepted. |
| Read the canonicalization like a c= value | Not applicable: the option is typed as one of the four pairs. |
| Header list as a string or an array, header list per signature | `the h= list`. The list is an array. |
| Over-signing (6 tests) | `the h= list > over-signing`, except: a name that isn't a valid field name throws a `RangeError` instead of being skipped, and ARC doesn't apply. |
| Refuse a header list without From | `options` |
| Write the identity into i=, identity outside d=, identity that breaks out of the tag, invalid identity syntax, empty local-part | `options` and `i=` |
| Write the identity as dkim-quoted-printable | `i=` |
| Hash a non-ASCII signature header line as UTF-8 | `the signature field` hashes the field `sign` writes, and every case in `i=` round-trips. |
| ARC instance, ARC-Message-Signature fields (4 tests) | Not applicable. |

## Other mailauth files

| Upstream file | Here |
| --- | --- |
| `header-smuggling-test.js`: 8 continuation bytes after a signed field | `sign.conformance.ts > header smuggling` |
| `header-smuggling-test.js`: keep a non-ASCII line inside the field, read a folded From like libmime | Same, observed as `fail` for the changed message. |
| `header-smuggling-test.js`: a colon on a folded continuation line | `header smuggling`, signed, and verified. Applying DMARC to it is @portable/dmarc's job. |
| `headers-only-test.js`: sign and verify without a body (3) | `sign.conformance.ts > messages` |
| `headers-only-test.js`: refuse an input without From (3) | `messages`, as `InvalidInputError` |
| `headers-only-test.js`: seal an empty input | Not applicable (ARC). |
| `body-length-test.js` | `sign` never writes `l=`, so these run with the reference signer in `verify.conformance.ts > body length (l=)`. |
| `message-parser-test.js`: line endings (8 bodies in 3 chunkings) | `canonicalization.conformance.ts > line endings` |
| `message-parser-test.js`: a leading empty line, an ordinary split | `messages` and `line endings` |
| `body/relaxed-test.js` | `relaxed body canonicalization`: empty body, message1.eml (whole and byte by byte), the edge cases, the #115 splits, and 300 generated bodies checked against the line-based reference. The sha1 cases don't apply. `l=` cases are in `body length (l=)`. The tests of internal buffers (`fixLineBuffer`, `pendingLineBreaks`) have no public equivalent. The 10 MB line test covers the long-line case. |
| `body/simple-test.js` | `simple body canonicalization`, the same way. |
| `header/relaxed-test.js`, `header/simple-test.js`, `header/index-test.js` | These test internal functions. Their canonicalization cases are in `header canonicalization`, observed through signatures that do or don't verify after the header changes. |
| `ec/verify-signatures-test.js` | `verify.conformance.ts > the RFC 8463 example message` and `sign.conformance.ts > private keys` |
| `parse-dkim-headers-test.js`: tag-list grammar | The tag-list cases are in the RFC compliance table (quotes, parentheses, backslashes, colons, FWS, invalid tag-specs, trailing semicolon). The Authentication-Results parsing tests don't apply. |
| `sign-time-test.js` | `t=` is taken from `now` once, and `the signature field` checks the default. The ARC test doesn't apply. |
| `mime-structure-start-test.js` | Not applicable. `mimeStructureStart` is not reported. |

## nodemailer

| Upstream test | Here |
| --- | --- |
| `dkim-test.ts`: sign message (byte by byte, LF line endings) | `canonicalization.conformance.ts`: the same `bh=`. nodemailer's 768-bit key is refused, so `b=` differs. |
| `dkim-test.ts`: large messages with and without a cache directory, as Buffer and String, cache errors and permissions | Not applicable: nothing is written to disk. The canonicalized body is kept in memory unless you pass an incremental `hasher`. |
| `dkim-test.ts`: unsupported hash algorithm | Not applicable, there is no hash algorithm option. |
| `dkim-test.ts`: DKIM signatures verified by mailauth (12 messages, no body, changed body, changed header) | `sign.conformance.ts > messages`, verified by `verify` and the reference verifier, and in `dkim.oracle.test.ts` by mailauth. |
| `message-parser-test.ts` (header and body split, chunk boundaries, LF, header bytes, keys, folding) | `line endings`, `messages`, and `header smuggling` |
| `message-parser-test.ts`: unfold a deeply folded header, trim a field name with a long blank run | `canonicalization.conformance.ts > adversarial input` and `linear-time.bench.ts > linear time` |
| `relaxed-body-test.ts` | `relaxed body canonicalization` |
| `sign-test.ts`: relaxed headers, skip fields | `header canonicalization`. There is no skip list: `headers` lists what to sign. |
| `sign-test.ts`: an unusable key returns false | `private keys`, as a `TypeError` |
| `sign-test.ts`: strip control characters and delimiters from the domain and selector | `options`: these are refused. |
| `sign-test.ts`: unicode domain | `options` |
| `sign-test.ts`: relaxed header canonicalization (6 tests) | `header canonicalization` |

## Known upstream issues

Each is tested where listed.

| Issue | Here |
| --- | --- |
| mailauth #115: the relaxed body hash depended on chunk boundaries. | `relaxed body canonicalization`: every split into two and three chunks. |
| mailauth #145: a key record name that can't exist was looked up. | A `d=` or selector that isn't a DNS name, or a key name over 253 octets, is a syntax error with no lookup. |
| mailauth #146: the key type was not checked against `a=` in the lenient mode. | Always checked: `inappropriate key algorithm`. |
| mailauth #147: an `l=` larger than the body passed. | `neutral`, `l= is longer than the body`. |
| mailauth #148, #152: `c=` syntax was not validated. | `c=` cases in the RFC compliance table. |
| mailauth #149: whitespace inside key record values was removed. | `v=DKIM 1` is an unknown version, and `n=see: notes (1)` is accepted. |
| mailauth #150: `i=` was written without dkim-quoted-printable. | `i=` tests. |
| mailauth #153: no way to over-sign. | `over-signing` tests. |
| mailauth: a lone CR was a line ending. | Lone CR cases in both body canonicalizations. |
| mailauth: header canonicalization treated every Unicode space as whitespace. | `relaxed does not accept a no-break space`, and nodemailer's 8-bit and ideographic-space messages. |
| mailauth: lines that start with other whitespace were separate fields, so a reader could show text the signature didn't cover. | `header smuggling` |
| mailauth: a message without a body could not be signed. | `messages` |
| nodemailer GHSA-39m8-27wv-hr27: unfolding was quadratic in continuation lines. | `linear time`: 40,000 continuation lines take at most 8 times as long as 10,000. |
| nodemailer: trimming a field name was quadratic in a blank run. | `linear time`, up to 1 MiB of spaces. |
| nodemailer: control characters and tag delimiters in the domain and selector were silently removed, so the signature was for a different domain than the caller passed. | Refused with a `RangeError`. |
| nodemailer: an unusable key made `sign` return `false`, and the message was sent unsigned. | Throws a `TypeError`. |

## Deliberate differences

- Problems with the key record give `permerror`, not `neutral`: no key, a revoked key, a key record syntax error, an unknown key version or type, a key not for email, a hash the key doesn't allow, a key type that doesn't match `a=`, `t=s` with a subdomain `i=`, and a key that doesn't import. RFC 8601 section 2.7.1 defines `permerror` as "a permanent error ... such as an absent or invalid key record", and `neutral` as a signature that couldn't be processed.
- rsa-sha1 and RSA keys under 1024 bits give `policy`, in every mode. `sign` refuses both.
- Results contain the domain, selector, and `i=` domain as A-labels.
- `verify` has no lenient mode, and no `rejectRsaSha1`, `strict`, or `minBitLength` options. `minKeyBits` replaces `minBitLength`.
