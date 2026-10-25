---
'@portable/image-size': minor
---

Initial release. `ImageSize.parse` and `parseStream` read an image's type and dimensions from its header, from bytes or from a `ReadableStream`. `parseStream` cancels the stream as soon as it knows the dimensions. Replaces image-size.
