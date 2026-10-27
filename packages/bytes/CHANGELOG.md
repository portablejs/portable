# @portable/bytes

## 0.1.0

### Minor Changes

- [`ef22071`](https://github.com/portablejs/portable/commit/ef22071656ac46dc37c780989da9b1caed3d7375) - Initial release. `Bytes.toHex` and `fromHex` convert a `Uint8Array` to hex and back, with the native methods where the runtime has them, `concat` joins byte arrays, and `equal` and `timingSafeEqual` compare them. Replaces the matching uint8array-extras functions and `crypto.timingSafeEqual` from `node:crypto`.

### Patch Changes

- Updated dependencies [[`f637257`](https://github.com/portablejs/portable/commit/f637257a41ca66306438256279150ee9e214671a)]:
  - @portable/errors@0.1.0
