---
'@portable/image-size': patch
---

`parseStream` parses its buffer again only after the buffer has doubled, so a stream of small chunks no longer takes quadratic time. It can read up to twice the bytes a format needs before it returns.
