---
'@portable/streams': minor
---

`concat` and `merge` take an array of sources and a `signal` option: `Streams.concat([a, b], { signal })`. Aborting errors the output with `signal.reason` and cancels every source.
