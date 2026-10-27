# @portable/compress

## 0.1.0

### Minor Changes

- [`5746f2c`](https://github.com/portablejs/portable/commit/5746f2cee876518202658c30fdc6e8763393ca74) - Initial release. `Compress.encode` and `Compress.decode` compress and decompress gzip, deflate, and deflate-raw on `CompressionStream`, `DecoderStream` decompresses a stream with a `maxBytes` limit, and `crc32` computes CRC-32. Replaces the one-shot use of pako and fflate, and the sync helpers in `node:zlib`.

### Patch Changes

- Updated dependencies [[`ef22071`](https://github.com/portablejs/portable/commit/ef22071656ac46dc37c780989da9b1caed3d7375), [`f637257`](https://github.com/portablejs/portable/commit/f637257a41ca66306438256279150ee9e214671a)]:
  - @portable/bytes@0.1.0
  - @portable/errors@0.1.0
