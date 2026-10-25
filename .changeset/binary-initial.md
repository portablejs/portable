---
'@portable/binary': minor
---

Initial release. `Binary.createReader` and `Binary.createWriter` read and write integers and floats in either byte order, varints (LEB128, zigzag, and SLEB128), and UTF-8 strings with a length or a terminating zero byte, and `utf8Length` counts a string's UTF-8 bytes. `FrameDecoderStream` splits a byte stream into length-prefixed frames, with a `maxBytes` limit, and `FrameEncoderStream` writes them. Replaces smart-buffer, varint, it-length-prefixed, and length-prefixed-stream.
