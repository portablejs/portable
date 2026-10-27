# @portable/streams

## 0.1.0

### Minor Changes

- [`a09a240`](https://github.com/portablejs/portable/commit/a09a240fc290f73902b2ffd85b7ac0fc3460aa97) - Initial release. `Streams.toBytes`, `toBlob`, `toText`, `toJson`, and `toArray` collect a stream with a `maxBytes` limit; `concat` and `merge` combine streams; `tee` splits one into any number of branches; `limitBytes`, `map`, `filter`, `tap`, `batch`, and `transform` transform a stream; and `fromIterable` and `toAsyncIterable` convert between streams and iterables. `abortable` makes a hand-written `Transformer` cancellable with an `AbortSignal`. `@portable/streams/node` has `toWeb` and `toWebObjects`, which convert a Node `Readable` to a `ReadableStream` in Node, Bun, and Deno. Replaces get-stream, concat-stream, bl, stream-to-array, merge2, merge-stream, through2, raw-body's limit handling, and `Readable.toWeb` from `node:stream`.

### Patch Changes

- Updated dependencies [[`ef22071`](https://github.com/portablejs/portable/commit/ef22071656ac46dc37c780989da9b1caed3d7375), [`f637257`](https://github.com/portablejs/portable/commit/f637257a41ca66306438256279150ee9e214671a)]:
  - @portable/bytes@0.1.0
  - @portable/errors@0.1.0
