---
'@portable/web-crypto': minor
---

Initial release. These helpers wrap `crypto.subtle` and take and return `Uint8Array`: `WebCrypto.digest`, `hmac` and `hkdf`; `importSeed`, which imports a 32-byte Ed25519 or X25519 private key with its public key; `publicKeyOf`; `importPem`, which imports a PKCS #8, SubjectPublicKeyInfo or PKCS #1 RSA key from PEM text; and `derToRawEcdsa` and `rawToDerEcdsa`, which convert ECDSA signatures between DER and raw `r || s`. Replaces ecdsa-sig-formatter and hand-written WebCrypto wrappers.
