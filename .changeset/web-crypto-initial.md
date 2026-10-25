---
'@portable/web-crypto': minor
---

Added `digest`, `hmac` and `hkdf`, which take bytes or strings and return `Uint8Array`; `importSeed`, which imports a 32-byte Ed25519 or X25519 private key with its public key; `publicKeyOf`; `importPem`, which imports a PKCS #8, SubjectPublicKeyInfo or PKCS #1 RSA key from PEM text, as `openssl` writes it; and `derToRawEcdsa` and `rawToDerEcdsa`, which convert ECDSA signatures between DER and the raw `r || s` form. `hmac` caches the keys it imports, so signing again with the same secret skips `importKey`.
