# Test parity

Upstream suites, read at these versions:

- [standardwebhooks 1.1.1 `libraries/javascript/src/webhook.test.ts`](https://github.com/standard-webhooks/standard-webhooks/blob/main/libraries/javascript/src/webhook.test.ts)
- [svix 2.8.0 `javascript/src/webhook.test.ts`](https://github.com/svix/svix-webhooks/blob/main/javascript/src/webhook.test.ts)
- [stripe 23.0.0 `test/Webhook.spec.ts`](https://github.com/stripe/stripe-node/blob/master/test/Webhook.spec.ts)
- [@octokit/webhooks-methods 6.0.0 `test/sign.test.ts` and `test/verify.test.ts`](https://github.com/octokit/webhooks-methods.js/tree/main/test)
- [@slack/bolt 5.1.0 `test/unit/receivers/verify-request.spec.ts`](https://github.com/slackapi/bolt-js/blob/main/test/unit/receivers/verify-request.spec.ts)

Test vectors come from those suites (MIT), except the Slack example request, which is from [Slack's documentation](https://docs.slack.dev/authentication/verifying-requests-from-slack). Svix uses Standard Webhooks with `svix-` headers, which `Webhooks.standard` reads when the `webhook-` headers are missing, so the standardwebhooks and svix rows share the `standard` tests.

## standardwebhooks and svix

| Upstream test | Covered by | Notes |
| --- | --- | --- |
| empty key raises error | `standard > rejects an empty secret` | Also `whsec_` alone. `undefined` and `null` are type errors at compile time. |
| missing id raises error | `standard > rejects a missing id header` | |
| missing timestamp raises error | `standard > rejects a missing timestamp header` | |
| invalid timestamp throws error | `standard > rejects a timestamp that is not a number` | |
| missing signature raises error | `standard > rejects a missing signature header` | |
| invalid signature throws error | `standard > rejects an invalid signature` | |
| partial signature throws error | `standard > rejects a partial signature` | |
| valid signature is valid and returns valid json | `standard > verifies a valid signature and returns the body` | `verify` returns the text, and the test parses it. |
| valid signature is valid without returning json | `standard > verifies a valid signature and returns the body` | There is no `jsonParse` option, because the body is always returned as text. |
| valid unbranded signature is valid | `standard > verifies a valid signature and returns the body`, `svix > verifies svix- headers` | |
| old timestamp fails | `standard > rejects a timestamp older than the tolerance` | |
| new timestamp fails | `standard > rejects a timestamp newer than the tolerance` | |
| multi sig payload is valid | `standard > accepts any one valid signature among several` | |
| verification works with and without signature prefix | `standard > works with and without the whsec_ prefix` | |
| sign function works | `standard > signs the published test vector` | |
| empty payload returns undefined | `standard > returns an empty body` | Returns `''`. |

## Stripe

| Upstream test | Covered by | Notes |
| --- | --- | --- |
| generateTestHeaderString: should throw when no opts are passed | skipped | `sign`'s options are required by its type. |
| generateTestHeaderString: should correctly construct a webhook header | `stripe > signs a header in t=<seconds>,v1=<hex> form` | |
| generateTestHeaderString: CryptoProviderOnlySupportsAsyncError | skipped | `sign` is always async, so there is no sync-only provider to report. |
| generateTestHeaderStringAsync: should throw when no opts are passed | skipped | As above. |
| generateTestHeaderStringAsync: should correctly construct a webhook header | `stripe > signs a header in t=<seconds>,v1=<hex> form` | |
| constructEvent: should return an Event instance from a valid JSON payload and valid signature header | `stripe > verifies a known header and returns the body` | |
| constructEvent: payload and header with type Buffer | `stripe > verifies a body given as bytes` | A header is always a string in `Headers`. |
| constructEvent: payload and header with type Uint8Array | `stripe > verifies a body given as bytes` | |
| constructEvent: should raise a JSON error from invalid JSON payload | `stripe > returns a body that is not JSON, for the caller to parse` | `verify` doesn't parse, so your own `JSON.parse` throws. |
| constructEvent: invalid signature header (unable to extract) | `stripe > rejects a header that does not have the expected format` | |
| constructEvent: no webhook payload was provided | `stripe > returns a body that is not JSON, for the caller to parse` | An empty body is signed content like any other. Standard Webhooks allows it too (`standard > returns an empty body`). |
| constructEvent: should error if you pass a signature which is an array | skipped | Headers are read from `Headers` or a string record, so there is no array form. |
| constructEvent: should invoke a custom CryptoProvider | `every scheme > stripe: an @noble/hashes hmac signs as the WebCrypto default does`, `verify > takes a synchronous or an asynchronous hmac` | The `hmac` option replaces `CryptoProvider`. |
| constructEvent: should throw when a v2 webhook payload is passed | skipped | `verify` doesn't look inside the body. See the README. |
| constructEvent: CryptoProviderOnlySupportsAsyncError | skipped | `verify` is always async. |
| verifyHeader: header does not have the expected format | `stripe > rejects a header that does not have the expected format` | |
| verifyHeader: header is null or empty | `stripe > rejects a missing or empty header` | |
| verifyHeader: no signatures with the expected scheme | `stripe > rejects a header with no v1 signature` | |
| verifyHeader: no valid signatures for the payload | `stripe > rejects a header with no valid signature` | |
| verifyHeader: timestamp not within the tolerance of the provided timestamp | `stripe > rejects a timestamp outside the tolerance of now` | `now` replaces `receivedAt`. |
| verifyHeader: timestamp not within the tolerance of Date.now() | `stripe > rejects a timestamp outside the tolerance of the current time` | |
| verifyHeader: valid signature within the tolerance of Date.now() | `stripe > accepts a timestamp within the tolerance of the current time` | |
| verifyHeader: valid signature within the tolerance of the provided timestamp | `stripe > accepts a timestamp within the tolerance of now` | |
| verifyHeader: at least one valid signature | `stripe > accepts a header with at least one valid signature` | |
| verifyHeader: timestamp off and no tolerance, so DEFAULT_TOLERANCE is used | `stripe > uses a five-minute tolerance by default` | |
| verifyHeader: timestamp off but tolerance explicitly set to 0 | `stripe > skips the timestamp check when tolerance is Infinity` | `Infinity` turns the check off, and `0` means the same second (`verify > accepts only the same second when tolerance is 0`). |
| verifyHeader: should accept Buffer instances for the payload and header | `stripe > verifies a body given as bytes` | |
| verifyHeader: payload is of an unknown type | `verify > rejects a parsed body` | Throws `TypeError`. |
| verifyHeader: signing secret contains whitespace | `stripe > rejects a signing secret with trailing whitespace` | The message doesn't point at the whitespace. |
| verifyHeader: signing secret is empty or nullish | `stripe > rejects an empty secret` | |
| verifyHeader: custom CryptoProvider (mismatch, success) | `verify > takes a synchronous or an asynchronous hmac` | |
| optional parameter defaults (current timestamp, provided timestamp, default tolerance, default crypto provider) | `standard > verifies a valid signature and returns the body`, `stripe > signs a header in t=<seconds>,v1=<hex> form`, `stripe > uses a five-minute tolerance by default` | |

## @octokit/webhooks-methods

| Upstream test | Covered by | Notes |
| --- | --- | --- |
| sign: is a function, sign.VERSION is set | skipped | No version property. |
| sign: throws without options, secret or eventPayload | `standard > rejects an empty secret` | Missing arguments are type errors. An empty body is valid and signed. |
| sign(secret, eventPayload) | `github > signs the known vector with a delivery id` | |
| sign: throws with eventPayload as object | skipped | The body is typed `string \| Uint8Array`. |
| verify: is a function, verify.VERSION is set | skipped | No version property. |
| verify() without options, secret, eventPayload or signature throws | `github > rejects a missing signature` | |
| verify: returns true for correct signature | `github > verifies a correct signature` | |
| verify: returns false for incorrect signature | `github > rejects a signature that is not sha256=<hex>` | `verify` throws `VerificationError` instead of returning `false`. |
| verify: returns false for incorrect secret | `github > rejects an incorrect secret` | |
| verify: payload contains special characters (#71) | `github > verifies a payload with escape sequences and multi-byte characters (octokit/webhooks.js#71)` | Upstream normalizes `\u001b` to `\u001B` before signing. The test signs GitHub's upper-case form and shows the lower-case form fails. |
| verify: with JSON eventPayload | `verify > rejects a parsed body` | |
| verifyWithFallback: is a function | skipped | |
| verifyWithFallback: (secret, [bogus]) and (bogus, [secret]) return true | `github > accepts the payload if any of several secrets matches` | |
| verifyWithFallback: (bogus, [bogus]) returns false | `github > accepts the payload if any of several secrets matches` | |

## @slack/bolt

| Upstream test | Covered by | Notes |
| --- | --- | --- |
| verifySlackRequest: should throw when signingSecret is empty string | `slack > rejects an empty signing secret` | |
| verifySlackRequest: should judge a valid request | `slack > verifies a valid request` | |
| verifySlackRequest: should detect an invalid timestamp | `slack > rejects a stale timestamp` | |
| verifySlackRequest: should detect an invalid signature | `slack > rejects an invalid signature` | `v0=invalid-signature` is malformed, and a well-formed wrong signature fails with `'signature'`. |
| isValidSlackRequest: valid request, invalid timestamp, invalid signature | the three tests above | `verify` throws, and `.then(() => true, () => false)` turns that into a boolean. |

Bolt's `HTTPModuleFunctions.spec.ts` tests the receiver around verification (body parsing, `ssl_check`, body size limits) and doesn't apply.

## Oracle

`webhooks.oracle.test.ts` runs 50 random payloads per scheme through each upstream signer and checks that `sign` produces the same headers. It then checks that `verify` accepts and rejects the same requests as upstream for six cases: untouched, changed body, changed signature, wrong secret, a timestamp 400 s old and one 200 s old. Bodies reach `verify` as a `Request` streamed in random chunks of 1 to 64 bytes. Future timestamps are left out of that loop, because Stripe and Slack accept them (see below).

## Known upstream issues

Each row has a test that shows our behavior.

| Issue | What goes wrong upstream | Ours | Test |
| --- | --- | --- | --- |
| Stripe and Slack only check the past | A timestamp any distance in the future passes, so clock skew on the sender goes unnoticed. | The tolerance applies in both directions. | `deliberate differences > stripe: rejects a timestamp ten minutes in the future…`, `slack > rejects a timestamp in the future beyond the tolerance` |
| Stripe and standardwebhooks decode the body before hashing | `TextDecoder` drops a leading byte order mark and replaces invalid UTF-8, so the HMAC is computed over different bytes. | The HMAC covers the bytes as received. | `deliberate differences > stripe: verifies a body with a byte order mark…`, `every scheme > *: signs and verifies bytes exactly…` |
| `parseInt` on timestamps (standardwebhooks, Stripe) | `123abc` is read as `123`. | `'malformed-header'`. | `deliberate differences > standard: rejects a timestamp with trailing characters…`, `stripe > rejects a timestamp with trailing characters` |
| Stripe's `tolerance: 0` | Turns the check off, although `0` reads as "no skew allowed". | `0` allows none, and `Infinity` turns it off. | `verify > accepts only the same second when tolerance is 0` |
| Stripe's duplicate `t=` | The last timestamp is used, with no error. | `'malformed-header'`. | `stripe > rejects a header with two timestamps` |
| Re-serialized JSON | A body parser that serializes JSON again changes whitespace, and the signature fails. Stripe and Svix document it as the most common cause of failed verification. | `verify` takes a `Request` and reads its bytes. A parsed object throws `TypeError`, and a re-serialized string fails with `'signature'`. | `verify > rejects a parsed body`, `stripe > rejects a re-serialized JSON body` |
| `whsec_` means different things | Standard Webhooks strips it and base64-decodes the rest, and Stripe uses the whole string, prefix included, as the key. | Each scheme reads the secret its provider's way. | `standard > works with and without the whsec_ prefix`, `stripe > keeps the whsec_ prefix as part of the key` |
| octokit's web build drops `sha256=` | `signature.replace('sha256=', '')` lets a bare hex signature pass. | `'malformed-header'`. | `deliberate differences > github: requires the sha256= prefix…` |
| octokit's web build parses hex with `match(/[\dA-F]{2}/gi)` | Characters that aren't hex are skipped, and a signature with no hex throws `TypeError: Cannot read properties of null`. | `'malformed-header'`. | `deliberate differences > github: rejects non-hex characters…` |
| Svix CVE-2024-21491 (Rust) | Comparing signatures of different lengths let a truncated signature pass. | Lengths must match before the constant-time compare. | `verify > rejects a truncated Standard Webhooks signature (CVE-2024-21491)` |
| Slack's missing signature header | `signature.split` throws a `TypeError` when `x-slack-signature` is absent. | `'missing-header'`. | `slack > rejects missing headers` |

## Benchmarks

`webhooks.bench.ts` verifies a 581-byte JSON body per scheme. @octokit/webhooks-methods has its own sign and verify benchmarks, which these cover.
