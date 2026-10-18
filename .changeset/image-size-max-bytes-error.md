---
'@portable/image-size': minor
---

`parseStream` throws the new `MaxBytesError`, which stores the limit as `maxBytes`, when it reads `maxBytes` without finding the dimensions. It threw `TruncatedError`, which now means only that the input ended.
