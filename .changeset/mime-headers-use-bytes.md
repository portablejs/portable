---
'@portable/mime-headers': patch
---

`decodeWords` joins the bytes of adjacent encoded words with `@portable/bytes`' `concat` instead of a private copy. Output is unchanged.
