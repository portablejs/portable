---
'@portable/binary': minor
---

Initial release. `Binary.createReader` and `Binary.createWriter` read and write integers and floats in either byte order, varints (LEB128, zigzag and SLEB128), and UTF-8 strings with a length or a terminating zero byte, and `utf8Length` counts a string's UTF-8 bytes. `FrameDecoderStream` and `FrameEncoderStream` split a byte stream into length-prefixed frames and write them, with a `maxBytes` limit. Replaces smart-buffer, varint, it-length-prefixed and length-prefixed-stream.
