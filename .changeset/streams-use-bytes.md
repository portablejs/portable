---
'@portable/streams': patch
---

`toBytes` joins chunks with `@portable/bytes`' `concat` instead of a private copy. Output is unchanged.
