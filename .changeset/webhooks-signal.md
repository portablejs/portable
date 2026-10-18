---
'@portable/webhooks': patch
---

`verify` and `sign` take a `signal` option. Aborting it rejects with `signal.reason` and cancels a `Request` body that is still being read.
