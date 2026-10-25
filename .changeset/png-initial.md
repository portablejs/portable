---
'@portable/png': minor
---

Added `decode` and `encode`, which convert between PNG files and 8-bit RGBA pixels with `DecompressionStream` and `CompressionStream`, and `decodeSync` and `encodeSync`, which take a zlib function such as fflate's. `maxPixels` rejects an image whose header claims too many pixels before anything is decompressed. A replacement for pngjs.
