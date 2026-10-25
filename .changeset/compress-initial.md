---
'@portable/compress': minor
---

Initial release. `Compress.encode` and `Compress.decode` compress and decompress gzip, deflate and deflate-raw on `CompressionStream`, `DecoderStream` decompresses a stream with a `maxBytes` limit, and `crc32` computes CRC-32. Replaces the one-shot use of pako and fflate, and the sync helpers in `node:zlib`.
