---
'@portable/streams': patch
---

`toBytes`, `toText`, `toJson`, `toArray`, `map`, `filter`, `tap`, `batch`, `limitBytes` and `transform` take a `signal` option. Aborting it rejects a collector with `signal.reason`, or errors a transform with it, and cancels the source.
