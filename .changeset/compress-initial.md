---
'@portable/compress': minor
---

Added `@portable/compress`: async `encode` and `decode` for gzip, deflate and deflate-raw on `CompressionStream`, a `DecoderStream` with a `maxBytes` limit, and `crc32`. It replaces pako and fflate when they compress a whole buffer at once, and the sync helpers in `node:zlib`.
