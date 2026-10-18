---
'@portable/png': patch
---

`decode` and the default `deflate` join chunks with `@portable/bytes`' `concat` instead of private copies. Output is unchanged.
