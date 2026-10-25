---
'@portable/png': minor
---

Initial release. `Png.decode` and `Png.encode` convert between PNG files and 8-bit RGBA pixels with `DecompressionStream` and `CompressionStream`, and `decodeSync` and `encodeSync` take a zlib function such as fflate's. `maxPixels` rejects an image whose header claims too many pixels before anything is decompressed. Replaces pngjs.
