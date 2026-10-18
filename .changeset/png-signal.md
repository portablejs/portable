---
'@portable/png': patch
---

`decode` and `encode` take a `signal` option. Aborting it rejects with `signal.reason` and stops the default `DecompressionStream` or `CompressionStream`.
