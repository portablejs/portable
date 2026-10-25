---
'@portable/password': minor
---

Initial release. `Password.hash`, `verify` and `needsRehash` hash passwords with PBKDF2-HMAC-SHA256 on WebCrypto and store them as PHC strings. `verify` also reads passlib's `pbkdf2_sha1`, `pbkdf2_sha256` and `pbkdf2_sha512` hashes. Replaces the PBKDF2 use of `node:crypto`, pbkdf2 and pbkdf2-password.
