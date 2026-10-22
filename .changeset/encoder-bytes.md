---
'@portable/base64': minor
'@portable/quoted-printable': minor
'@portable/csv': minor
'@portable/jsonl': minor
'@portable/json-stream': minor
'@portable/mail': patch
'@portable/rpc': patch
---

`Base64.EncoderStream`, `QuotedPrintable.EncoderStream`, `Csv.EncoderStream`, `Jsonl.EncoderStream` and `JsonStream.encodeStream` emit `Uint8Array` instead of `string`, so their output can go straight into a `Response` body. Remove the `TextEncoderStream` after them, or pipe through `TextDecoderStream` for text.
