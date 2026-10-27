# @portable/password

## 0.1.0

### Minor Changes

- [`90b7e05`](https://github.com/portablejs/portable/commit/90b7e05d7fdbcd3b661364fb79c69410f65fe6a7) - Initial release. `Password.hash`, `verify`, and `needsRehash` hash passwords with PBKDF2-HMAC-SHA256 on WebCrypto and store them as PHC strings. `verify` also reads passlib's `pbkdf2_sha1`, `pbkdf2_sha256`, and `pbkdf2_sha512` hashes. Replaces the PBKDF2 use of `node:crypto`, pbkdf2, and pbkdf2-password.

### Patch Changes

- Updated dependencies [[`6b36d08`](https://github.com/portablejs/portable/commit/6b36d08e2331b7e55d90165a4bf6f43961291c8e), [`ef22071`](https://github.com/portablejs/portable/commit/ef22071656ac46dc37c780989da9b1caed3d7375), [`f637257`](https://github.com/portablejs/portable/commit/f637257a41ca66306438256279150ee9e214671a), [`c04a3b9`](https://github.com/portablejs/portable/commit/c04a3b916eacf40859ed1cd8a4de9544de8208a1)]:
  - @portable/base64@0.1.0
  - @portable/bytes@0.1.0
  - @portable/errors@0.1.0
  - @portable/timers@0.1.0
