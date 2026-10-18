---
'@portable/image-size': patch
---

`parseStream` takes a `signal` option. Aborting it rejects with `signal.reason` and cancels the stream.
