---
'@portable/jsonl': minor
'@portable/json-stream': minor
'@portable/mime-headers': minor
---

`Jsonl.DecoderStream`, `JsonStream.DecoderStream` and `MimeHeaders.parseHeaders` take a `maxLength` option and throw the package's new `MaxLengthError` when a line, a matched value or the header block is longer. The default is `Infinity`, as in `Lines.DecoderStream`.
