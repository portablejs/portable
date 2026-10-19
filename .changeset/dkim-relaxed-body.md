---
'@portable/dkim': patch
---

Relaxed body canonicalization copies runs of non-whitespace bytes at once, which makes verifying a 250 KB message about 25% faster.
