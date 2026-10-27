# @portable/web-crypto

## 0.1.0

### Minor Changes

- [`0a1b9a3`](https://github.com/portablejs/portable/commit/0a1b9a33d8d94abb1e241bbee8f7b90a809c954c) - Initial release. These helpers wrap `crypto.subtle` and take and return `Uint8Array`: `WebCrypto.digest`, `hmac`, and `hkdf`; `importSeed`, which imports a 32-byte Ed25519 or X25519 private key with its public key; `publicKeyOf`; `importPem`, which imports a PKCS [#8](https://github.com/portablejs/portable/issues/8), SubjectPublicKeyInfo, or PKCS [#1](https://github.com/portablejs/portable/issues/1) RSA key from PEM text; and `derToRawEcdsa` and `rawToDerEcdsa`, which convert ECDSA signatures between DER and raw `r || s`. Replaces ecdsa-sig-formatter and hand-written WebCrypto wrappers.

### Patch Changes

- Updated dependencies [[`ef22071`](https://github.com/portablejs/portable/commit/ef22071656ac46dc37c780989da9b1caed3d7375), [`f637257`](https://github.com/portablejs/portable/commit/f637257a41ca66306438256279150ee9e214671a)]:
  - @portable/bytes@0.1.0
  - @portable/errors@0.1.0
