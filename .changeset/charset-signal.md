---
'@portable/charset': patch
---

`EncoderStream` takes a `signal` option. Aborting it errors the stream with `signal.reason` and cancels the source piped into it.
