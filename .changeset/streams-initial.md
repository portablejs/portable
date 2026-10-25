---
'@portable/streams': minor
---

Initial release. `Streams.toBytes`, `toBlob`, `toText`, `toJson` and `toArray` collect a stream with a `maxBytes` limit, `concat` and `merge` combine streams, `tee` splits one into any number of branches, `limitBytes`, `map`, `filter`, `tap`, `batch` and `transform` transform a stream, and `fromIterable` and `toAsyncIterable` convert between streams and iterables. `abortable` makes a hand-written `Transformer` cancellable with an `AbortSignal`. `@portable/streams/node` has `toWeb` and `toWebObjects`, which convert a Node `Readable` to a `ReadableStream` in Node, Bun, and Deno. Replaces get-stream, concat-stream, bl, stream-to-array, merge2, merge-stream, through2, raw-body's limit handling and `Readable.toWeb` from `node:stream`.
