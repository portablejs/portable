---
'@portable/json-stream': minor
---

Added `ParserStream`, which emits the values at selected JSONPath expressions from a JSON stream, `NdjsonDecoderStream` and `NdjsonEncoderStream` for NDJSON, and `encode`, which writes JSON text from a tree of promises, async iterables and streams. Replaces JSONStream, stream-json, ndjson, json-stream-stringify and @worker-tools/json-stream.
