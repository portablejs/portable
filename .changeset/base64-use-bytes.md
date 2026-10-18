---
'@portable/base64': patch
---

`EncoderStream` joins bytes with `@portable/bytes`' `concat` instead of a private copy. Output is unchanged.
