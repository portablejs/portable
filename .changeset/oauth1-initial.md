---
'@portable/oauth1': minor
---

Initial release. `OAuth1.sign` and `OAuth1.authorization` sign OAuth 1.0a requests (RFC 5849) with HMAC-SHA1, HMAC-SHA256, RSA-SHA1 and PLAINTEXT. HMAC and hashing use WebCrypto, and the `hmac` and `digest` options take other implementations. Replaces oauth-1.0a and node-oauth.
