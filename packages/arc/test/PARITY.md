# Parity with mailauth's ARC

Upstream: mailauth 7.3.1's [`test/arc/`](https://github.com/postalsys/mailauth/tree/master/test/arc), the ARC test in `test/mailauth-test.js`, and the reference sealer in `test/helpers/arc-reference.js`.

`utils.ts` ports mailauth's reference sealer to WebCrypto. It is written from the RFCs and shares no code with the package, and it builds each field from a literal tag list, so a test can seal with any tags, including invalid ones. mailauth checks most of its cases in both its lenient and its strict mode. This package has only RFC behavior, so each case maps to the strict expectation, and lenient-only expectations (warnings such as `arc-tag-syntax`) have no counterpart.

`arc.oracle.test.ts` runs in Node and checks that:

- `verify` gives mailauth's strict result on all 171 messages of ValiMail's validation suite;
- on two-set chains sealed here over 12 generated messages, and on a chain from the reference sealer, `verify`, and mailauth's strict mode agree after each of 11 changes, such as a changed body, a changed AAR, a removed seal, or swapped instances;
- mailauth's strict mode passes sets sealed here with RSA and Ed25519 keys;
- chains that alternate between mailauth's `sealMessage` and `seal` pass in both, over four hops.

## arc-suite-validation-test.js and arc-suite-sign-test.js

ValiMail's [ARC test suite](https://github.com/ValiMail/arc_test_suite) (MIT, `fixtures/arc-test-suite-LICENSE.txt`), copied from mailauth's fixtures.

| Upstream | Here |
| --- | --- |
| ARC Validation Suite, 10 groups, 171 cases | `suite.conformance.ts` › "ARC validation suite", every case. As in mailauth's strict mode, `ams_fields_h_empty` and `ams_fields_c_na` expect `fail` where the draft suite expects `pass`: RFC 8617 section 4.1.2 gives the AMS the DKIM-Signature rules of RFC 6376, which reject an empty `h=` and read a missing `c=` as simple/simple. |
| lax mode skips `as_format_tags_sc`, `as_format_tags_key_case`, `as_format_tags_dup`, `as_format_inv_tag_key` | Not skipped: there is no lax mode, and all four fail as the suite expects. |
| ARC Signing Suite, 2 groups, 17 cases | `suite.conformance.ts` › "ARC signing suite": seals each message with the suite's key, time, and header list and the `cv=` that `verify` found, compares `bh=`, `cv=`, and `i=` with the suite's ARC set, then checks that `verify` gives `pass`, or `fail` for a `cv=fail` set. A case with no expected set must throw `Arc.InvalidInputError`. The suite's key records contain line breaks from the YAML, which the test resolver removes. |

## arc-rfc-compliance-test.js

| Upstream | Here |
| --- | --- |
| cv values: validates every seal behind a cv=PASS seal (lax, strict) | `verify.conformance.ts` › "validates every seal behind a cv=PASS seal that signed only its own set" |
| accepts a valid chain that writes cv=Pass and cv=None | › "accepts a valid chain that writes cv=Pass and cv=None" |
| never returns true from verifyASChain for a newest cv=fail | › "fails a chain whose newest seal is cv=fail without checking older seals" (through `verify`, because there is no separate chain function) |
| never returns true from verifyASChain when an older seal is invalid | › "fails when an older seal is invalid" |
| Ed25519: verifies an ed25519-sha256 ARC-Seal | › "verifies an ed25519-sha256 ARC-Seal" |
| rejects an ed25519 seal made without the pre-hash | › "rejects an ed25519 ARC-Seal made without the SHA-256 pre-hash" |
| seals with an ed25519 key (algorithm unset, lower case, upper case) | `seal.conformance.ts` › "seals with an Ed25519 key". There is no algorithm option. |
| seals with an ed25519 key from authenticate() | `@portable/mail-auth`'s tests. |
| refuses an algorithm that does not match the key; refuses rsa-sha1 | Not applicable: the key type sets `a=`. `verify.conformance.ts` › "fails an rsa-sha1 ARC-Seal" covers the validator side. |
| tag syntax: duplicate tag, duplicate cv, upper case tag name, empty tag-spec, invalid tag name, non-numeric t=, AMS duplicate tag (strict) | › "fails a duplicate tag" through "fails a duplicate tag in the AMS". |
| tag syntax: the same cases accepted with a warning (lax) | Not applicable: no lax mode. |
| upper case BH= in the AMS (strict: unknown tag) | › "reads an upper case BH= in the AMS as an unknown tag" |
| ignores an unknown tag; reads an upper case H= as an unknown tag | › "ignores x9=abc on an ARC-Seal", "ignores H=from on an ARC-Seal" |
| fails a chain whose newest AMS does not sign From | › "fails one whose h= does not include From" |
| Sealing: cv=none for the first set | `seal.conformance.ts` › "writes ARC-Seal, ARC-Message-Signature, and ARC-Authentication-Results with i=1 and cv=none" |
| requires a cv value when extending | › "is required when the message has ARC fields" |
| reads the cv value case-insensitively | Deliberately different: `chainValidation` is `'none' \| 'pass' \| 'fail'`, the values `verify` returns, and › "must be none, pass, or fail, in lower case" checks that `PASS` throws. |
| refuses a cv that is not none, pass or fail | › "must be none, pass, or fail, in lower case" |
| does not seal a chain whose newest seal is cv=fail | › "refuses a chain whose newest seal is cv=fail" |
| seals a broken chain with cv=fail as the next instance | › "seals a broken chain with cv=fail as the next instance, covering only the new set" |
| does not claim cv=pass over an unparseable chain | › "refuses cv=pass over a chain whose sets cannot be read" |
| refuses an instance that already exists; refuses instances 0, 51, 1.5, "x"; seals a gap only in lax mode | Not applicable: there is no instance option. The instance is always one more than the highest on the message. |
| seals a cv value that does not fit the instance only in lax mode | › "must be none for the first set and only for the first set" (always refused) |
| passes the strict option to the AMS signer (512-bit key) | › "refuses a short RSA key, a bad domain, a bad selector, and a bad date" |
| does not add a 51st set | › "refuses a 51st set" |
| extends a chain that validates | › "extends a valid chain with cv=pass as the next instance" |
| AMS without c= is simple/simple | `verify.conformance.ts` › "reads an AMS without c= as simple/simple" |
| accepts an AMS without c= signed relaxed with a warning (lax) | Not applicable: no lax mode. |
| looks up the shared key once for the AMS, its fallback and the seal | › "looks up each key once" |
| rejects an AMS without c= signed relaxed (strict) | › "fails an AMS without c= that was signed relaxed/relaxed, as the drafts did" |
| instances 0x1, 1.0, +1, 1e0 | › "fails i=0x1" and the others |
| accepts i=01 | › "accepts i=01" |
| accepts an ARC-Seal whose i= is not first | › "accepts an ARC-Seal whose i= is not the first tag" |
| AAR whose i= is not first | › "fails an ARC-Authentication-Results whose i= is not first" |
| stray ARC-Seal with i=0, i=abc, i=51 | › "fails a chain with a stray ARC-Seal with i=0" and the others |
| only a malformed ARC header: none (lax), fail (strict) | › "fails a message whose only ARC field is malformed" |
| strips b= with FWS around the equals sign | › "strips b= with FWS around the equals sign" |
| fails a seal whose a= does not match the key type | › "fails a seal whose a= does not match the key type" |
| applies a key record h=, s=, v= to ARC keys | › "applies the key record h=, s= and v= to ARC keys", and "applies the key record to an ARC-Seal whose key differs from the AMS key" for the seal's own key |
| ignores c=relaxed, c=relaxed/relaxed, c=simple on an ARC-Seal | › "ignores c=relaxed on an ARC-Seal" and the others. mailauth also checks the seal isn't reported as a DKIM signature, and `Arc.verify` reports no DKIM results. |
| d= that is not a host name, 6 separators × 3 placements, without a key query | › "fails d=one.example/x.attacker.test in the ARC-Seal and the AMS without a key query" and the other 17 |
| fails an older ARC-Seal with such a d= | › "fails an older ARC-Seal with such a d=" |
| accepts a U-label d= | › "accepts a U-label d= and looks up its A-label" |
| AMS header list: signs DKIM-Signature by default; takes an array; never signs ARC fields or Authentication-Results | `seal.conformance.ts` › "signs DKIM-Signature by default", "takes the list as an array", "never signs ARC fields or Authentication-Results" |
| Authentication-Results reporting: arc=none and smtp.remote-ip; quoted IPv6; lax arc= entry | `@portable/mail-auth`, which formats Authentication-Results. |

## arc-hardening-test.js

| Upstream | Here |
| --- | --- |
| Crafted Authentication-Results values (dotted keys, `toString` shadowing, `value=` parts, well-formed `header.i`) | Not applicable here: `verify` returns the AAR text and doesn't parse it into objects. `@portable/mail-auth` builds the `arc=pass` comment and has these cases. |
| Public key failures: weak key, missing key, unparseable key | `verify.conformance.ts` › "reports a weak, a missing, and an unusable key" |
| Sealing failures: an AMS that can't be signed is not sealed, and no empty line is written | Not applicable: the key type sets the algorithm, and `seal` throws instead of returning partial fields. |
| createSeal returns the instance of the created set | `seal.conformance.ts` › "seals one message repeatedly, each set over the last" |
| createSeal returns no instance when no set was created | Not applicable: `seal` throws. |
| checks a large authResults without running out of stack | › "checks a large value without running out of stack" |
| shouldSeal of a failed chain | `seal` itself refuses only a newest `cv=fail`: › "refuses a chain whose newest seal is cv=fail" and "seals a chain with a missing ARC-Seal of the newest set with cv=fail as i=3". |

## arc-seal-options-test.js

| Upstream | Here |
| --- | --- |
| seals concurrent messages sharing one seal object | `seal.conformance.ts` › "does not change the options object, so it can seal several messages at once" |
| reuses one seal object for consecutive sealMessage() calls | › "seals one message repeatedly, each set over the last" |
| keeps an explicit instance as given | Not applicable: no instance option. |
| authenticate() seals a broken chain with cv=fail; a new message with cv=none | `@portable/mail-auth`'s tests. |
| seals a chain with a missing AAR, a missing newest ARC-Seal, a duplicate ARC field, a failing signature with cv=fail | › "seals a chain with a missing ARC-Authentication-Results with cv=fail as i=3" and the other three |
| does not seal a broken chain whose newest seal has cv=fail | › "refuses a chain whose newest seal is cv=fail" |
| refuses 10 kinds of invalid authResults | › "refuses a CRLF that starts a new header field" and the other nine |
| accepts a value folded with CRLF and whitespace | › "accepts a value folded with CRLF and whitespace, and writes it as given" |

## mailauth-test.js

| Upstream | Here |
| --- | --- |
| ARC sealing: does not add a 51st ARC set | `seal.conformance.ts` › "refuses a 51st set". The `authenticate` side is in `@portable/mail-auth`. |

## Known upstream issues

| Issue | Here |
| --- | --- |
| mailauth's default mode accepts ARC-Seal syntax errors, instances such as `i=0x1`, a stray ARC field with an invalid instance, and an AMS without `c=` signed relaxed/relaxed (the draft default). | RFC behavior only. Each case has a test above. |
| [#159](https://github.com/postalsys/mailauth/issues/159): sealing stored the instance and body hash on the caller's seal object, so concurrent seals with one object mixed up body hashes. | "does not change the options object, so it can seal several messages at once" |
| [#161](https://github.com/postalsys/mailauth/issues/161): an `authResults` value with a bare line break started a new header field or ended the header block. | The 10 "refuses …" cases under `authResults`. |
| [#162](https://github.com/postalsys/mailauth/issues/162): a malformed chain was sealed as a second `i=1`, or not at all. | "seals a broken chain with cv=fail as the next instance, covering only the new set" and the four "seals a chain with …" cases. |
| A `d=` with `/` or `@` sent the key query to a zone the attacker controls. | The 19 "fails d=… without a key query" cases check that no key is looked up. |
| Public key failures reported a bare `arc=fail` with no reason. | "reports a weak, a missing, and an unusable key" checks each `reason`. |
| A seal over a chain with a failed AMS signing wrote an empty line into the header block. | `seal` signs nothing until every check passes, and either returns all three fields or throws. |
