---
'@portable/base64': patch
'@portable/charset': patch
'@portable/csv': patch
'@portable/json-stream': patch
'@portable/jsonl': patch
'@portable/lines': patch
'@portable/mime-stream': patch
'@portable/quoted-printable': patch
'@portable/sse': patch
---

The stream classes handle their `signal` option with `Streams.abortable` from `@portable/streams` instead of a private copy, so the package now depends on `@portable/streams`. Other behavior is unchanged.
