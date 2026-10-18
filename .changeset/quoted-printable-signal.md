---
'@portable/quoted-printable': patch
---

`EncoderStream` and `DecoderStream` take a `signal` option. Aborting it errors the stream with `signal.reason` and cancels the source piped into it.
