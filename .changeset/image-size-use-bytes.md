---
'@portable/image-size': patch
---

JPEG XL parsing joins codestream boxes with `@portable/bytes`' `concat` instead of a private copy. Results are unchanged.
