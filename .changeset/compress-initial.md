---
'@portable/compress': minor
---

Added `@portable/compress`: async `encode` and `decode` for gzip, deflate and deflate-raw on `CompressionStream`, a `DecoderStream` with a `maxBytes` limit, and `crc32`. It replaces the one-shot use of pako and fflate and `node:zlib`'s sync helpers.
