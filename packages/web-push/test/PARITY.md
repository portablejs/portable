# Parity with web-push

Upstream: [web-push](https://github.com/web-push-libs/web-push) 3.6.7 (MPL-2.0), test files under `test/`. Each upstream test maps to our test for the same case, or to the reason it doesn't apply. Tests marked "both" ran once per content encoding upstream. We support only aes128gcm, so the `aesgcm` run maps to the "aesgcm" row under Not applicable.

Our test files are `encrypt.conformance.ts`, `vapid.conformance.ts` and `send.conformance.ts` (Node and Chromium), `web-push.oracle.test.ts` (Node) and `web-push.bench.ts`.

The RFC 8291 Appendix A vector is in `encrypt.conformance.ts` ("encrypts the example message byte for byte"), and the RFC 8292 §2.4 example token checks our JWT verifier in `vapid.conformance.ts`.

## test-encryption-helper.js

| Upstream test | Ours |
| --- | --- |
| is defined | Covered by every test that calls `encrypt`. |
| encrypt/decrypt string (aes128gcm) | encrypt > a string decrypts to its UTF-8 bytes; oracle: http_ece decrypts what encrypt writes |
| encrypt/decrypt buffer (aes128gcm) | encrypt > bytes decrypt to the same bytes |
| bad input to encrypt: all null | encrypt > rejects malformed subscription keys > no subscription keys |
| bad input: no public key | > only auth |
| bad input: no auth | > only p256dh |
| bad input: no payload | encrypt > rejects a payload that is not a string or bytes |
| bad input: auth `'Fake'` | > auth of 15 bytes, > an empty auth |
| bad input: payload `[]` | encrypt > rejects a payload that is not a string or bytes |

## test-vapid-helper.js

| Upstream test | Ours |
| --- | --- |
| is defined | Covered by every test that calls `generateVapidKeys` or signs. |
| generate vapid keys | generateVapidKeys > returns a 65-byte public key and a 32-byte private key as base64url |
| generate vapid keys with padding (mocks a 27-byte private key) | Same test, run 50 times. WebCrypto exports `d` as a JWK field, which RFC 7518 §6.2.2.1 fixes at 32 bytes, so there is no short key to pad. The upstream mock tests web-push's padding code, which we don't have. |
| generate new vapid keys between calls | generateVapidKeys > returns a new key pair on every call |
| bad input: no arguments; audience only; no keys; no private key | VAPID Authorization header > rejects a missing vapid option, > rejects an empty private key |
| bad input: audience `'Not a URL'`, audience object | send > rejects an endpoint that is not a URL, > an object endpoint. The audience comes from the endpoint, so you can't pass a bad one. |
| bad input: http: and ftp: subjects, `'Some Random String'`, object subject | VAPID Authorization header > rejects an http: subject, an ftp: subject, a subject that is not a URL, an object subject |
| bad input: public key `'Example key'`, `Buffer.alloc(5)` | > rejects a public key that is not base64url, an object public key |
| bad input: private key `'Example Key'`, `Buffer.alloc(5)` | > rejects a private key that is not base64url, an object private key |
| bad input: invalid encoding type | Not applicable: no `contentEncoding` option. |
| bad input: public or private key in standard base64 | > rejects a public key in standard base64, a private key in standard base64 |
| bad input: expiration as text, object, boolean, numeric string, or 25 hours ahead | Not applicable: the expiration is always 12 hours ahead and not an option. VAPID Authorization header > carries an ES256 JWT for the endpoint origin checks it is under 24 hours. |
| valid headers: https: subject, https://localhost subject, mailto: subject, mailto: localhost subject | VAPID Authorization header > accepts the subject … (4 cases) |
| valid headers: custom expiration, expiration 0, expiration 5 hours ahead | Not applicable: no expiration option. |

## test-set-vapid-details.js

`setVapidDetails` stores keys in module state. We have none: `vapid` is an option of each call.

| Upstream test | Ours |
| --- | --- |
| is defined; valid URL input; valid mailto: input | VAPID Authorization header > accepts the subject … |
| reset Vapid Details with null | Not applicable: no module state. |
| invalid: empty, non-URL, object and boolean subjects | > rejects an empty subject, a subject that is not a URL, an object subject, a boolean subject |
| invalid: 60-byte, non-base64url, empty, object and boolean public keys | > rejects a 60-byte public key, a public key that is not base64url, an empty public key, an object public key, a boolean public key |
| invalid: 60-byte, non-base64url, empty, object and boolean private keys | > rejects a 31-byte private key, a private key that is not base64url, an empty private key, an object private key |
| `'mailto: example@example.com'` is valid | Deliberately rejected: > rejects a mailto: subject with a space. Apple rejects the token (see Known upstream issues). |

## test-generate-request-details.js

| Upstream test | Ours |
| --- | --- |
| is defined | toRequest > returns the request send would make |
| 0 arguments; no endpoint; empty, array, object, boolean endpoint | send > rejects no subscription, no endpoint, an empty endpoint, an array endpoint, an object endpoint, a boolean endpoint |
| payload with no keys, invalid keys, only p256dh, only auth | send > rejects a payload with no keys, a payload with only p256dh, a payload with only auth; encrypt > rejects … keys that are not an object |
| userPublicKey or userAuth isn't a string | encrypt > rejects … p256dh as a number, auth as a number. A `Uint8Array` is accepted on purpose (encrypt > accepts keys as bytes). |
| userPublicKey too long or too short; userAuth too short | encrypt > rejects … p256dh one byte too long, one byte too short, auth of 15 bytes |
| payload isn't a string or buffer | send > rejects a payload that is not a string or bytes |
| invalid `vapid` option (instead of `vapidDetails`) | Covered by types: `vapid` is the option and is required. VAPID Authorization header > rejects a missing vapid option. |
| duplicated headers | Not applicable: no `headers` option. To add headers, call `toRequest` and set them on the `Request`. |
| invalid agent; ignore agent if proxy defined; proxy option; proxy as object; agent option | Not applicable: no `agent` or `proxy`. Pass a `fetch` that uses one. |
| Extra headers (TTL, Topic, Urgency) | send > sends ttl, sends urgency, sends a topic |
| Audience contains port with aes128gcm | VAPID Authorization header > keeps a non-default port in the audience |
| Audience contains port with aesgcm | Not applicable: aesgcm. |

## testSendNotification.js

The upstream suite runs an HTTPS server. Ours passes a recording `fetch`, which receives the same `Request` a push service would.

| Upstream test | Ours |
| --- | --- |
| is defined | Every send test. |
| send/receive string | send > POSTs the encrypted payload with the push headers |
| send/receive string (non-urlsafe base64) | encrypt > accepts standard base64 keys with padding |
| send/receive buffer | send > sends bytes |
| send/receive unicode character | send > sends a non-ASCII string |
| send/receive without message; without message with TTL | send > sends no body when the payload is undefined, sends ttl |
| send/receive string with TTL | send > sends ttl 0, 5, 86400 |
| send notification with message with vapid | send > POSTs the encrypted payload … (checks the JWT signature) |
| send/receive empty message | send > sends an empty string as an encrypted empty payload. Upstream sends no body for `''`. |
| send/receive extra headers | Not applicable: no `headers` option. |
| server returns 201; server returns 202 | send > returns sent for status 200, 201, 202, 204 |
| GCM and FCM tests (10 cases: GCM API key, FCM with and without VAPID, global options) | Not applicable: GCM shut down in 2019 and FCM's legacy server keys in 2024. FCM web push takes VAPID like every other push service. |
| rejects: the 0-argument, endpoint and key cases | As in test-generate-request-details.js above. |
| rejects when the response status code is unexpected (404) | Deliberately different: send > returns gone for status 404 and 410. send > throws ResponseError for status 400, 403, 413, 429, 500, 503. |
| rejects when payload isn't a string or buffer | send > rejects a payload that is not a string or bytes |
| send notification with invalid vapid option | VAPID Authorization header > rejects a missing vapid option |
| rejects when it can't connect to the server | send > rejects with the fetch error when the push service is unreachable |

## testSetGCMAPIKey.js

Not applicable: no GCM support (see above).

## test-cli.js

Not applicable: no command-line tool. `generateVapidKeys` replaces `web-push generate-vapid-keys`.

## testBrowsers.js

Runs a real Chrome and Firefox, subscribes, sends through Google's and Mozilla's push services, and checks the service worker receives the message. It needs network access to those services, so we don't run it. Our conformance tests decrypt every message the way a browser does (`decrypt` in `utils.ts`, which follows RFC 8291 §3.4), and the RFC 8291 vector checks the bytes.

## Not applicable

- **aesgcm.** The draft encoding from before RFC 8291. RFC 8291 requires aes128gcm, and every current browser accepts it.
- **Module state** (`setVapidDetails`, `setGCMAPIKey`). Options are passed per call.

## Known upstream issues

| Issue | Ours |
| --- | --- |
| Node only: `crypto.createECDH`, `https.request` and `Buffer` fail on Cloudflare Workers ([#718](https://github.com/web-push-libs/web-push/issues/718)), and Deno payloads failed to decrypt in Chrome ([#904](https://github.com/web-push-libs/web-push/issues/904)). | Only WebCrypto and `fetch`. Every conformance test also runs in Chromium. |
| No way to tell a gone subscription from other errors, so you have to check `statusCode` yourself ([#885](https://github.com/web-push-libs/web-push/issues/885)). | send > returns gone for status 404 and 410 |
| No payload size check. http_ece splits a payload over about 4079 bytes into several records, which no push service accepts, and FCM and Apple reject bodies over 4096 bytes. | encrypt > accepts 3993 bytes as one 4096-byte record, > rejects a payload one byte over the limit with MaxBytesError |
| `TTL: NaN` and fractions pass the `< 0` check and are sent, and Apple answers `BadTtl`. Before PR #492, `TTL: 0` became the four-week default ([#284](https://github.com/web-push-libs/web-push/issues/284)). | send > rejects ttl -1, 1.5, NaN, Infinity, '60'; > sends ttl 0 |
| `mailto: user@example.com` with a space passes validation and Apple rejects the token ([#939](https://github.com/web-push-libs/web-push/issues/939)). The localhost warning reads `URL.hostname`, which is empty for `mailto:`. | VAPID Authorization header > rejects a mailto: subject with a space. A localhost subject is accepted, as upstream, and the JSDoc of `Vapid.subject` says Apple rejects it. |
| A new JWT for every message. Apple asks senders not to refresh tokens more than once an hour. | VAPID Authorization header > reuses a token for the same origin and keys |
| A token signed with mismatched VAPID keys is sent, and the push service rejects it ([#679](https://github.com/web-push-libs/web-push/issues/679)). | VAPID Authorization header > rejects a private key that belongs to another public key |
| `p256dh` is checked only for length, so a key off the curve fails deep inside OpenSSL ([#292](https://github.com/web-push-libs/web-push/issues/292)), and `Buffer.from(…, 'base64url')` skips characters outside the alphabet. `auth` longer than 16 bytes is accepted. | encrypt > rejects … p256dh not on the curve, compressed, with characters outside base64, auth of 17 bytes |
| Short VAPID private keys from `getPrivateKey()` ([#295](https://github.com/web-push-libs/web-push/issues/295)). | generateVapidKeys > returns … a 32-byte private key, run 50 times |
| Any endpoint URL is accepted, including `http:` ones, so a subscription posted by a client can point the server at an internal address. | send > rejects an http: endpoint |
| The response body is decoded chunk by chunk with `responseText += chunk`, which breaks a UTF-8 character split across chunks. | `ResponseError.body` comes from `Response.text()`. |
| The `timeout` option is a socket idle timeout with no default and no `AbortSignal` ([#568](https://github.com/web-push-libs/web-push/issues/568)). | send > passes the signal to fetch through the request, > rejects an aborted signal before sending |
| Upstream's `validateRequest` checks the payload only `if (typeof message !== 'undefined')`, and `message` is never defined, so its send tests never decrypt what they send. | Every send test with a payload decrypts the body. |
