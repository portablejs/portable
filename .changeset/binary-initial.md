---
'@portable/binary': minor
---

Added `createReader` and `createWriter` for integers, floats, varints and strings in binary data, and `FrameDecoderStream` and `FrameEncoderStream` for length-prefixed frames, as a replacement for smart-buffer, varint, it-length-prefixed and length-prefixed-stream.
