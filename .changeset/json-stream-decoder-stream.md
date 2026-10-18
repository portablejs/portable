---
'@portable/json-stream': minor
---

Renamed `ParserStream` to `DecoderStream` and `encode` to `encodeStream`, so the names follow the other packages: `DecoderStream` for a transform from bytes to values, and the `Stream` suffix for a function whose output is a stream. `InvalidInputError` and `TruncatedError` now extend `Error` instead of `TypeError`.
