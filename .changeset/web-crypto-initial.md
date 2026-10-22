---
'@portable/web-crypto': minor
---

Added `digest`, `hmac` and `hkdf`, which take bytes or strings and return `Uint8Array`; `importSeed`, which imports a 32-byte Ed25519 or X25519 private key with its public key; `publicKeyOf`; and `derToRawEcdsa` and `rawToDerEcdsa`, which convert ECDSA signatures between DER and the raw `r || s` form.
