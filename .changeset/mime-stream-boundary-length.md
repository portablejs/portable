---
'@portable/mime-stream': patch
---

`DecoderStream` throws `MaxBoundaryLineBytesError` when a `boundary` parameter is longer than `maxBoundaryLineBytes` allows, instead of reading lines that can never match it.
