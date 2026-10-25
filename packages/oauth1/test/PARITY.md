# Test parity

Upstream suites: [oauth-1.0a 2.2.6 `test/`](https://github.com/ddo/oauth-1.0a/tree/master/test) and [oauth (node-oauth) 0.10.2 `tests/`](https://github.com/ciaranj/node-oauth/tree/master/tests). The RSA key pair in `fixtures/rsa-pkcs1.pem` and `fixtures/rsa-public.pem` is copied from node-oauth's `tests/oauthtests.js` (MIT, Ciaran Jessup). `fixtures/rsa-pkcs8.pem` is the same key converted with `crypto.createPrivateKey(pem).export({ type: 'pkcs8', format: 'pem' })`.

The RFC 5849 examples are in `rfc5849.conformance.ts`. They omit `oauth_version`, which this package always sends, so the tests add `oauth_version=1.0` to the RFC's base strings and compute the expected HMAC with WebCrypto.

`oauth1.oracle.test.ts` compares the `Authorization` header with oauth-1.0a on 300 random requests and 30 random JSON bodies with `oauth_body_hash`, sending form bodies in random chunks, and with node-oauth's `authHeader` on 100 random GET requests and 20 RSA-SHA1 requests. The generator avoids the inputs listed under "Known upstream issues", where we differ on purpose.

## oauth-1.0a

| Upstream test | Covered by | Notes |
| --- | --- | --- |
| `twitter_sample_data.js` #getParameterString, #getBaseString, #getSigningKey, #getSignature, #authorize, #toHeader | `cases from the oauth-1.0a test suite > Twitter documentation example: base string, signing key, signature and header` | The base string, signing key and parameter string are private. The header holds the signature, which is wrong if any of them is. |
| `getParameterString.js` #getParameterStringEmptyGetParam | `known oauth-1.0a issues > "?&" adds no parameters` | Upstream signs `=` (an empty name) for `?&`. |
| `oauth_body_hash.js` #getBodyHash with data as an object | `oauth_body_hash, from the oauth-1.0a test suite > a JSON body is hashed and not signed as parameters` | The body is a `Request` body, so the object is passed as its `JSON.stringify`. |
| `oauth_body_hash.js` #getBodyHash with data as a string | `oauth_body_hash, from the oauth-1.0a test suite > a text body is hashed with SHA-1` | |
| `oauth_body_hash.js` #authorize includes oauth_body_hash | `oauth_body_hash, from the oauth-1.0a test suite > a JSON body is hashed and not signed as parameters` | |
| `oauth_body_hash.js` #toHeader includes oauth_body_hash | `oauth_body_hash, from the oauth-1.0a test suite > a JSON body is hashed and not signed as parameters` | |
| `options/consumer.js` throws without consumer | skipped | `consumer` is a required property in the types. |
| `options/last_ampersand.js` default (true), Twitter example | `cases from the oauth-1.0a test suite > the signing key ends in "&" when there is no token secret` | |
| `options/last_ampersand.js` default (true), ampersand at the end | same | |
| `options/last_ampersand.js` false, Twitter example | same | |
| `options/last_ampersand.js` false, no ampersand at the end | skipped | No `last_ampersand` option: RFC 5849 §3.4.2 requires the `&`. |
| `options/multiple_values.js` signature, nonce, timestamp | `cases from the oauth-1.0a test suite > a form value repeated in the body and the query is signed every time` | Upstream's signature is for a base string with `alt=json` once, although it is in both the query and the body. See "Known upstream issues". |
| `options/multiple_values_qs.js` signature, nonce, timestamp | `cases from the oauth-1.0a test suite > duplicate query parameters are all signed` | Same signature as upstream. |
| `options/nonce_length.js` default 32 | `cases from the oauth-1.0a test suite > the nonce defaults to 32 random characters` | |
| `options/nonce_length.js` length 100, random length | skipped | No `nonce_length` option. Pass `nonce` to choose one. |
| `options/parameter_seperator.js` default `, ` | `cases from the oauth-1.0a test suite > the header separates parameters with ", " and holds only oauth_ parameters` | |
| `options/parameter_seperator.js` `-` | skipped | No separator option. `-` is not valid header syntax (RFC 5849 §3.5.1). |
| `options/realm.js` header with realm | `cases from the oauth-1.0a test suite > realm comes first in the header and is not signed` | |
| `options/signature_method.js` default PLAINTEXT | `cases from the oauth-1.0a test suite > the signature method defaults to HMAC-SHA1` | Deliberate difference: the default is HMAC-SHA1. |
| `options/signature_method.js` default PLAINTEXT hash function | `RFC 5849 examples > §3.4.4: PLAINTEXT signs with the encoded secrets joined by "&"` | |
| `options/signature_method.js` missing hash function throws | `cases from the oauth-1.0a test suite > a signature method the package does not implement throws UnsupportedError` | Every listed method is built in, so the error is for an unknown method. |
| `services/twitter.js` (6 live tests) | skipped | Need live credentials. The header and query placements they use are covered by `sign()` and `signUrl` tests. Form placement (`form: oauth.authorize(...)`) is not supported. |
| `services/bitbucket.js` (2 live tests) | skipped | Live. The request token step is the same as `§1.2: PLAINTEXT temporary credentials request with realm and callback`, signed with HMAC-SHA1. |
| `services/flickr.js` (5 live tests) | skipped | Live. |
| `services/openbank.js` (1 live test, HMAC-SHA256) | skipped | Live. HMAC-SHA256 is covered by `HMAC-SHA1 and HMAC-SHA256 sign the base string with the signing key`. |

## oauth (node-oauth)

| Upstream test | Covered by | Notes |
| --- | --- | --- |
| When newing OAuth: followRedirects is enabled by default | skipped | No HTTP client. See the README about redirects. |
| signature base string described in oauth.net/core/1.0 #sig_base_example | `RFC 5849 examples > OAuth Core 1.0 §A.5.2 example signature` | |
| signature with RSA-SHA1 | `RSA-SHA1 > signs with a PKCS #1 PEM key` | Same signature. `signs with a CryptoKey, and the public key verifies the signature` also verifies it. |
| signature with HMAC-SHA1 | `cases from the node-oauth test suite > HMAC-SHA1 encodes the consumer secret in the signing key`, `HMAC-SHA1 and HMAC-SHA256 sign the base string with the signing key` | Upstream signs a hand-written base string with a raw `!` in it, which no request produces. |
| signature with HMAC-SHA256 | `cases from the node-oauth test suite > HMAC-SHA1 and HMAC-SHA256 sign the base string with the signing key` | |
| signature base string with PLAINTEXT | `cases from the node-oauth test suite > PLAINTEXT with an empty consumer secret` | |
| normalising a url: default ports stripped | `cases from the node-oauth test suite > default ports are dropped, other ports kept, and an empty path becomes "/"` | |
| normalising a url: non-default ports kept | same | |
| normalising a url: trailing slash added | same | |
| array out of the arguments hash: flatten arrays | `cases from the node-oauth test suite > parameters are sorted by name, then by value` | Repeated names come from the query string. |
| ordering request parameters: by name | same | |
| ordering request parameters: same name by value | same | |
| normalising request parameters (RFC 5849 §3.4.1.3.2) | `RFC 5849 examples > §3.4.1: query, form body, duplicates, empty values and realm` | |
| foo[bar] style url parameters | `cases from the node-oauth test suite > foo[bar] query names are signed as written` | |
| signing a url: no token | `cases from the node-oauth test suite > signUrl: without a token` | The signature is in sorted position in the query, where node-oauth appends it last. |
| signing a url: token | `cases from the node-oauth test suite > signUrl: with a token` | |
| signing a url: token and token secret | `cases from the node-oauth test suite > signUrl: with a token and a token secret` | |
| request token: HTTP method from client options, POST by default | skipped | No HTTP client. The caller picks the `Request` method, which is signed. |
| access token: HTTP method from client options, POST by default | skipped | Same. |
| authorization header: token and token secret | `cases from the node-oauth test suite > authHeader: with a token and a token secret` | The separator is `", "`, not `","`. |
| authorization header: variable whitespace separator | skipped | No separator option. |
| OAuth Echo authorization header | `cases from the node-oauth test suite > OAuth Echo: the verify-credentials request is signed with a realm` | Upstream sends `oauth_version="1.0A"`, which RFC 5849 doesn't allow, so the expected signature is computed for `1.0`. |
| non standard ports: Host header | `cases from the node-oauth test suite > default ports are dropped, other ports kept, and an empty path becomes "/"` | `fetch` sets `Host`. The port is in the signed base string. |
| building the Authorization header: oauth arguments concatenated | `cases from the oauth-1.0a test suite > the header separates parameters with ", " and holds only oauth_ parameters` | |
| building the Authorization header: only oauth arguments | same | |
| building the Authorization header: no Array.prototype.toString | skipped | The header is built from strings, not arrays. `known node-oauth issues > Object.prototype properties do not change the signature (#174)` covers prototype pollution. |
| secure request POST: extra_params form the POST body | `cases from the node-oauth test suite > form body parameters are signed and the body is sent unchanged` | |
| POST without callback returns a request object; with callback calls end | skipped | No HTTP client. |
| POST body buffer with content type passed through | `cases from the node-oauth test suite > a binary body keeps its bytes and content type and is not signed` | |
| POST body buffer without content type | skipped | node-oauth sets `application/x-www-form-urlencoded` on binary data. `Request` sets no type for bytes, and the body is not signed. |
| POST body object url-encoded | `cases from the oauth-1.0a test suite > a URLSearchParams body is signed like the same form string` | Pass `new URLSearchParams(object)`. |
| POST body string with non-ASCII: byte length | `cases from the node-oauth test suite > a non-ASCII form body is signed by its UTF-8 bytes` | `Request` computes `Content-Length`. |
| POST body string without content type | skipped | `Request` sends a string as `text/plain`, which is not signed. node-oauth labels it as a form but doesn't sign it either (#366). |
| POST body string with content type | `known node-oauth issues > a form body given as a string is signed (#366)` | |
| PUT: same cases as POST (7 tests) | `a binary body keeps its bytes and content type and is not signed` (POST and PUT), the rest as POST | |
| DELETE: returns request, calls end | `cases from the node-oauth test suite > GET, DELETE and a lowercase method are signed in upper case` | Only the signed method applies. |
| GET: returns request, calls end | same | |
| Request with a callback: 200, 210, 301, 302 with and without Location, followRedirects true and false (12 tests) | skipped | No HTTP client. |
| `sha1tests.js` HMAC-SHA1 of the oauth.net example | `RFC 5849 examples > OAuth Core 1.0 §A.5.2 example signature` | |
| `oauth2tests.js` (all) | skipped | OAuth 2.0, which this package doesn't cover. |

## Known upstream issues

| Issue | Test |
| --- | --- |
| oauth-1.0a [#24](https://github.com/ddo/oauth-1.0a/issues/24): `+` in the query is not decoded as a space | `known oauth-1.0a issues > "+" in the query is a space (#24)` |
| oauth-1.0a #24: an escaped `&` or `=` in a query value | `known oauth-1.0a issues > an encoded "&" or "=" in the query stays part of its value (#24)` |
| oauth-1.0a: query names are not decoded, so `a%20b` is signed as `a%2520b` | `known oauth-1.0a issues > query parameter names are decoded before they are encoded` |
| oauth-1.0a [#59](https://github.com/ddo/oauth-1.0a/issues/59) (open): the default port is signed | `known oauth-1.0a issues > the default port is left out of the base string (#59)` |
| oauth-1.0a: the host is not lowercased and the fragment is signed | `RFC 5849 examples > §3.4.1.2: scheme and host are lowercased and the default port is dropped`, `known oauth-1.0a issues > the fragment is left out of the base string` |
| oauth-1.0a [#49](https://github.com/ddo/oauth-1.0a/issues/49): repeated values are sorted before they are encoded | `known oauth-1.0a issues > values of one name are sorted by their encoded form` |
| oauth-1.0a: an empty value is dropped when the name repeats (`?a=&a=b`) | `known oauth-1.0a issues > an empty value does not hide a repeated name` |
| oauth-1.0a: a name in both the query and `data` is signed once | `cases from the oauth-1.0a test suite > a form value repeated in the body and the query is signed every time` |
| oauth-1.0a: `decodeURIComponent` throws `URIError` on a bad escape, and turns non-UTF-8 bytes into U+FFFD | `known oauth-1.0a issues > an incomplete escape is signed as literal characters instead of throwing`, `escaped bytes that are not UTF-8 keep their value` |
| oauth-1.0a [#21](https://github.com/ddo/oauth-1.0a/issues/21), [#22](https://github.com/ddo/oauth-1.0a/issues/22): `'` in data | `known oauth-1.0a issues > !, *, ', ( and ) in form values are percent-encoded (#21, #22)` |
| oauth-1.0a [#60](https://github.com/ddo/oauth-1.0a/issues/60), [#110](https://github.com/ddo/oauth-1.0a/issues/110) (open): JSON bodies signed as parameters | `known oauth-1.0a issues > a JSON body is not signed as parameters (#60, #110)` |
| oauth-1.0a [#50](https://github.com/ddo/oauth-1.0a/issues/50): realm is not escaped | `known oauth-1.0a issues > a realm with quotes is escaped as an HTTP quoted-string (#50)` |
| oauth-1.0a [#65](https://github.com/ddo/oauth-1.0a/issues/65): body hash must be SHA-1 | `oauth_body_hash, from the oauth-1.0a test suite > a text body is hashed with SHA-1`, `HMAC-SHA256 hashes the body with SHA-256` |
| oauth-1.0a [#109](https://github.com/ddo/oauth-1.0a/issues/109) (open): an RSA key is percent-encoded and joined with `&` before signing | `RSA-SHA1 > signs with a PKCS #1 PEM key` |
| oauth-1.0a: the default nonce comes from `Math.random` | `cases from the oauth-1.0a test suite > the nonce defaults to 32 random characters` (the nonce comes from `crypto.getRandomValues`) |
| node-oauth [#375](https://github.com/ciaranj/node-oauth/issues/375) (open): repeated query names are signed as `a[0]`, `a[1]` | `known node-oauth issues > a repeated query name is signed as repeated pairs, not as a[0] and a[1] (#375)` |
| node-oauth [#366](https://github.com/ciaranj/node-oauth/issues/366) (open): a form body passed as a string is not signed | `known node-oauth issues > a form body given as a string is signed (#366)` |
| node-oauth [#326](https://github.com/ciaranj/node-oauth/issues/326): POST with query parameters | `known node-oauth issues > a POST with a query and a form body signs both (#326)` |
| node-oauth [#113](https://github.com/ciaranj/node-oauth/issues/113): parentheses in POST data | `known node-oauth issues > parentheses in form data are encoded (#113)` |
| node-oauth [#64](https://github.com/ciaranj/node-oauth/issues/64): PLAINTEXT signature encoding | `known node-oauth issues > the PLAINTEXT signature is percent-encoded in the header (#64)` |
| node-oauth [#174](https://github.com/ciaranj/node-oauth/issues/174) (open): `Object.prototype` additions break signing | `known node-oauth issues > Object.prototype properties do not change the signature (#174)` |
| node-oauth [#353](https://github.com/ciaranj/node-oauth/issues/353): multipart bodies | `known node-oauth issues > a multipart body is not signed` |
| WebCrypto imports only PKCS #8, and OpenSSL writes `RSA PRIVATE KEY` (PKCS #1) | `RSA-SHA1 > signs with a PKCS #1 PEM key`. `WebCrypto.importPem` reads the key, and its own tests cover more PEM forms. |
