# @portable/base64

## 0.1.0

### Minor Changes

- [`6b36d08`](https://github.com/portablejs/portable/commit/6b36d08e2331b7e55d90165a4bf6f43961291c8e) - Initial release. `Base64.encode` and `Base64.decode` convert bytes to base64 and base64url and back, with optional MIME line wrapping, and `EncoderStream` and `DecoderStream` do the same on streams. They use the native `Uint8Array.prototype.toBase64` and `Uint8Array.fromBase64` where the runtime has them. Replaces libbase64, base64-js, and js-base64.

### Patch Changes

- Updated dependencies [[`ef22071`](https://github.com/portablejs/portable/commit/ef22071656ac46dc37c780989da9b1caed3d7375), [`f637257`](https://github.com/portablejs/portable/commit/f637257a41ca66306438256279150ee9e214671a), [`a09a240`](https://github.com/portablejs/portable/commit/a09a240fc290f73902b2ffd85b7ac0fc3460aa97)]:
  - @portable/bytes@0.1.0
  - @portable/errors@0.1.0
  - @portable/streams@0.1.0
