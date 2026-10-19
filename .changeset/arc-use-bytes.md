---
'@portable/arc': patch
---

Compare body hashes with `Bytes.equal` from `@portable/bytes`, since `@portable/dkim/internal` no longer exports its own `equal`.
