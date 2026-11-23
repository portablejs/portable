---
'@portable/binary': patch
---

`FrameDecoderStream` gives `InvalidInputError.offset` for a bad varint prefix as a position in the stream. It used to give the position in its internal buffer, which differs from the stream position after the first chunk.
