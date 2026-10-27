# @portable/json-stream

## 0.1.0

### Minor Changes

- [`b31418b`](https://github.com/portablejs/portable/commit/b31418b10a448f37d065949d91083e74305ce385) - Initial release. `JsonStream.DecoderStream` emits the values at selected JSONPath expressions from a JSON stream, and `encodeStream` writes JSON text from a tree of promises, async iterables, and streams. Replaces JSONStream, stream-json, json-stream-stringify, and @worker-tools/json-stream. For NDJSON, use @portable/jsonl.

### Patch Changes

- Updated dependencies [[`ef22071`](https://github.com/portablejs/portable/commit/ef22071656ac46dc37c780989da9b1caed3d7375), [`f637257`](https://github.com/portablejs/portable/commit/f637257a41ca66306438256279150ee9e214671a), [`a09a240`](https://github.com/portablejs/portable/commit/a09a240fc290f73902b2ffd85b7ac0fc3460aa97)]:
  - @portable/bytes@0.1.0
  - @portable/errors@0.1.0
  - @portable/streams@0.1.0
