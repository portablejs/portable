---
'@portable/image-size': minor
---

Added `parse` and `parseStream`, which read an image's type and dimensions from its header bytes or from a `ReadableStream`, as a replacement for image-size. `parseStream` cancels the stream as soon as the dimensions are known.
