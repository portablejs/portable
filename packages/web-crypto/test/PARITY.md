# Test parity

Upstream suite: [ecdsa-sig-formatter 1.0.11 `spec/`](https://github.com/Brightspace/node-ecdsa-sig-formatter/tree/master/spec) (Apache-2.0). `digest`, `hmac`, `hkdf` and `importSeed` replace hand-written WebCrypto calls rather than a library, so their cases come from the RFCs: RFC 4231 (HMAC), RFC 5869 (HKDF), RFC 8032 section 7.1 (Ed25519) and RFC 7748 sections 5.2 and 6.1 (X25519). `test/vectors.ts` holds them, parsed from the RFC text. These are also the vectors @noble/hashes' `hmac.test.ts` and `kdf.test.ts` use.

`fixtures/wycheproof/` holds Wycheproof's ECDSA verification vectors for P-256 with SHA-256, P-384 with SHA-384 and P-521 with SHA-512 (1,530 cases), from [C2SP/wycheproof](https://github.com/C2SP/wycheproof) (Apache-2.0, `LICENSE` alongside), with the comments and PEM keys removed.

## ecdsa-sig-formatter `spec/der-to-jose.js`

Each case runs for ES256, ES384 and ES512, which are `namedCurve` `'P-256'`, `'P-384'` and `'P-521'` here.

| Upstream test | Covered by | Notes |
| --- | --- | --- |
| should throw for no signature | skipped | The TypeScript signature requires a `Uint8Array`. |
| should throw for non buffer or base64 signature | skipped | Takes bytes only, so there is no base64 input to reject. |
| should throw for unknown algorithm | skipped | `namedCurve` is a union type. |
| should throw for no seq | `derToRawEcdsa (ecdsa-sig-formatter) > rejects input without a SEQUENCE` | |
| should throw for seq length exceeding input | `> rejects a SEQUENCE length longer than the input` | |
| should throw for r is not marked as int | `> rejects r that is not an INTEGER` | |
| should throw for r length exceeds available input | `> rejects an r length longer than the input` | |
| should throw for r length exceeds sensical param length | `> rejects an r longer than the curve allows` | Upstream's input fails here because of its leading zeros, so ours puts a non-zero byte first. |
| should throw for s is not marked as int | `> rejects s that is not an INTEGER` | `r` is `00 80` so that the INTEGER before `s` is valid. |
| should throw for s length exceeds available input | `> rejects an s length longer than the input` | |
| should throw for s length does not consume available input | `> rejects bytes after s` | |
| should throw for s length exceeds sensical param length | `> rejects an s longer than the curve allows` | |

## ecdsa-sig-formatter `spec/jose-to-der.js`

| Upstream test | Covered by | Notes |
| --- | --- | --- |
| should throw for no signature | skipped | The TypeScript signature requires a `Uint8Array`. |
| should throw for non buffer or base64 signature | skipped | Takes bytes only. |
| should throw for unknown algorithm | skipped | The curve follows from the length, so there is no algorithm argument. |
| should throw for incorrect signature length (ES256, ES384, ES512) | `rawToDerEcdsa (ecdsa-sig-formatter) > rejects a %i-byte signature` | Lengths one byte either side of 64, 96 and 132, and 0. |

## ecdsa-sig-formatter `spec/inverse.js`

| Upstream test | Covered by |
| --- | --- |
| ES256, ES384, ES512 should jose -> der -> jose | `round trips (ecdsa-sig-formatter) > <curve> raw to DER and back (made with WebCrypto)` |
| ES256, ES384, ES512 should der -> jose -> der | `round trips (ecdsa-sig-formatter) > <curve> DER to raw and back (made with OpenSSL)` |

## ecdsa-sig-formatter `fuzz/happy.js` and `benchmarks/`

`fuzz/happy.js` signs random messages with OpenSSL and checks that DER converts to JOSE and back unchanged. `round trips > <curve> signatures from crypto.subtle verify after a round trip through DER` does the same with WebCrypto signatures in every runtime, and the oracle test converts 500 node:crypto signatures per curve in each direction and compares with ecdsa-sig-formatter and @noble/curves. `web-crypto.bench.ts` covers upstream's `benchmarks/der-to-jose.js` and `jose-to-der.js`.

## RFC vectors

| Source | Covered by |
| --- | --- |
| FIPS 180-2 "abc" for SHA-1, SHA-256, SHA-384 and SHA-512 | `digest > hashes "abc" with %s` |
| RFC 4231 test cases 1 to 7, HMAC-SHA-256, -384 and -512 | `hmac (RFC 4231) > test case N with <hash>` |
| RFC 4231 HMAC-SHA-224 | skipped: WebCrypto has no SHA-224. |
| RFC 5869 test cases 1 to 7 (SHA-256 and SHA-1) | `hkdf (RFC 5869) > test case N with <hash>` |
| RFC 8032 section 7.1 TEST 1, 2, 3, 1024 and SHA(abc) | `importSeed Ed25519 (RFC 8032) > TEST <name>`: the public key and the signature |
| RFC 7748 section 5.2, X25519 vectors 1 and 2 | `importSeed X25519 (RFC 7748) > multiplies the scalar of section 5.2 vector N` |
| RFC 7748 section 5.2, iterated vectors | skipped: they iterate the function a million times and test X25519 itself, which WebCrypto implements. |
| RFC 7748 section 6.1 | `importSeed X25519 (RFC 7748) > computes both public keys and the shared secret of section 6.1` |

## Wycheproof

`Wycheproof > <curve> with <hash>` converts every signature with `derToRawEcdsa` and verifies the result with `crypto.subtle.verify`. Every valid case must convert, convert back to the same DER, and verify. Every case flagged `BerEncodedSignature`, `InvalidEncoding` or `MissingZero` must throw `InvalidInputError`. Every other invalid case must throw or fail to verify.

## `importPem`

`importPem` replaces the PEM parsing that dkim and oauth1 each had, so its cases are theirs: a PKCS #8 and a PKCS #1 RSA private key, text that is not PEM, bad base64 and a block too short to be a key. `fixtures/pem/` holds node-oauth's RSA key pair from `tests/oauthtests.js` (MIT, Ciaran Jessup) as `rsa-pkcs1.pem.txt` and `rsa-spki.pem.txt`, the same key as PKCS #8 in `rsa-pkcs8.pem.txt` and as a PKCS #1 public key in `rsa-pkcs1-public.pem.txt` (written by `openssl rsa -RSAPublicKey_out`), and a P-256 key in SEC 1 form in `ec-sec1.pem.txt` (written by `openssl ecparam -genkey -noout`), which `importPem` rejects with `UnsupportedError`. `pem.conformance.ts` also checks CRLF line breaks, text and a certificate before the key, Ed25519, ECDSA and ECDH keys exported by `crypto.subtle`, the default usages and an encrypted PEM block.

## Known upstream issues

| Issue | Covered by |
| --- | --- |
| `derToJose` accepts a long-form length where the short form fits (BER, not DER). | `known ecdsa-sig-formatter issues` (oracle) and `derToRawEcdsa > rejects a long-form SEQUENCE length under 128` |
| `derToJose` accepts a negative INTEGER and returns its bytes as a positive `r`. | `known ecdsa-sig-formatter issues` and `derToRawEcdsa > rejects a negative INTEGER` |
| `derToJose` accepts an INTEGER with an unneeded leading zero, and an empty INTEGER. | `known ecdsa-sig-formatter issues` and `derToRawEcdsa > rejects an unneeded leading zero`, `> rejects an empty INTEGER` |
| `derToJose` drops the top byte of a 33-byte ES256 INTEGER even when it isn't zero, so it returns a different signature instead of failing. | `known ecdsa-sig-formatter issues` and `derToRawEcdsa > rejects a 33-byte r instead of dropping its top byte` |
| WebCrypto rejects an empty HMAC key, which RFC 2104 allows. | `hmac > accepts an empty key` and the oracle's key length 0 |
| `crypto.subtle.digest(hash, view.buffer)` hashes the whole buffer. | `digest > hashes only the bytes a subarray covers`, `hmac > uses only the bytes subarrays cover` |

## Oracle tests

`web-crypto.oracle.test.ts` compares `digest`, `hmac`, `hkdf`, `importSeed`, `publicKeyOf` and the ECDSA conversions with node:crypto, @noble/hashes, @noble/curves and ecdsa-sig-formatter. `web-crypto.fuzz.oracle.test.ts` checks random raw signatures, biased toward leading zero bytes and a set top bit, against @noble/curves on P-256, P-384 and P-521: `rawToDerEcdsa` writes the same DER, and `derToRawEcdsa` accepts every mutated DER signature that @noble/curves accepts and converts it to the same raw bytes.
