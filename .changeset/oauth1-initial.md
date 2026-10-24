---
'@portable/oauth1': minor
---

Added `sign` and `authorization` for OAuth 1.0a (RFC 5849) request signing with HMAC-SHA1, HMAC-SHA256, RSA-SHA1 and PLAINTEXT, as a replacement for oauth-1.0a and node-oauth. HMAC and hashing use WebCrypto, and the `hmac` and `digest` options take other implementations.
