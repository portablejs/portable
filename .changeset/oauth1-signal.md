---
'@portable/oauth1': patch
---

`sign` and `authorization` take a `signal` option. Aborting it rejects with `signal.reason` and cancels a request body that is still being read.
