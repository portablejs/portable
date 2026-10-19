---
'@portable/compress': minor
'@portable/csv': minor
'@portable/dkim': minor
'@portable/mime-stream': minor
---

Take a `signal` in the functions and streams that didn't yet, as every other package does. Aborting rejects with `signal.reason`, or errors the stream with it and cancels its source.

- compress: `encode`, `decode` and `DecoderStream`.
- csv: `DecoderStream` and `EncoderStream`.
- dkim: `sign`.
- mime-stream: `DecoderStream`, `EncoderStream` and `splitHeaders`, which also errors `body` when the signal aborts after the header block is read.
