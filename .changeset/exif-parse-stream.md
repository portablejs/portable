---
'@portable/exif': minor
---

Added `parseStream`, which reads a `ReadableStream` only until the EXIF data is found, then cancels it, with `maxBytes` and `signal` options, and `MaxBytesError` for the `maxBytes` limit. A PNG with two `IHDR` chunks now reports the size from the first one.
