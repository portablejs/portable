# @portable/png

## 0.1.0

### Minor Changes

- [`5979e69`](https://github.com/portablejs/portable/commit/5979e69004fa4ed44820ba29f1c71c61aedad14b) - Initial release. `Png.decode` and `Png.encode` convert between PNG files and 8-bit RGBA pixels with `DecompressionStream` and `CompressionStream`, and `decodeSync` and `encodeSync` take a zlib function such as fflate's. `maxPixels` rejects an image whose header claims too many pixels before anything is decompressed. Replaces pngjs.

### Patch Changes

- Updated dependencies [[`ef22071`](https://github.com/portablejs/portable/commit/ef22071656ac46dc37c780989da9b1caed3d7375), [`f637257`](https://github.com/portablejs/portable/commit/f637257a41ca66306438256279150ee9e214671a)]:
  - @portable/bytes@0.1.0
  - @portable/errors@0.1.0
