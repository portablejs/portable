---
'@portable/json-stream': patch
---

`DecoderStream` and `encodeStream` take a `signal` option. Aborting it errors the stream with `signal.reason`, cancels the source piped into `DecoderStream`, and cancels the streams and iterators nested in an `encodeStream` value.
