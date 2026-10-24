---
'@portable/streams': minor
---

Added `abortable(transformer, { signal })`, which wraps a `Transformer` so that aborting `signal` errors its `TransformStream` with `signal.reason` and cancels the source piped into it. Use it to give your own transforms a `signal` option.
