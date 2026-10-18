---
'@portable/charset': patch
---

`EncoderStream` with `bom: true` writes the byte order mark once when a chunk holds no text, such as an empty string or a lone high surrogate. It wrote it again with the next chunk.
