---
'@portable/streams': minor
---

Added collectors (`toBytes`, `toBlob`, `toText`, `toJson`, `toArray`) with a `maxBytes` guard, `concat`, `merge` and `limitBytes` for combining streams, and `fromIterable`, `toAsyncIterable`, `transform`, `map`, `filter`, `tap` `batch` and `tee` for moving between streams and iterables. Replaces get-stream, concat-stream, bl, stream-to-array, merge2, merge-stream, through2 and raw-body's limit handling.
