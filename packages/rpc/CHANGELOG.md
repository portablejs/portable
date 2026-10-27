# @portable/rpc

## 0.1.0

### Minor Changes

- [`8ebdda6`](https://github.com/portablejs/portable/commit/8ebdda6ce448764af23cd351e2894d1e5c4b6758) - Initial release. `Rpc.connect`, `provide`, `call`, `notify`, and `withContext` make typed JSON-RPC 2.0 calls over any `{ readable, writable }` transport, with streaming results that apply backpressure, and cancellation through `$/cancel`. `port` wraps a `MessagePort`, `Worker`, or `BroadcastChannel`; `window` connects to another window; `handler` and `http` carry calls over HTTP; and `json` is the default codec. Where the runtime has `Symbol.asyncDispose`, a remote declared with `await using` closes its connection at the end of the scope. Replaces comlink, penpal, post-me, birpc, and json-rpc-2.0.

### Patch Changes

- Updated dependencies [[`f637257`](https://github.com/portablejs/portable/commit/f637257a41ca66306438256279150ee9e214671a), [`c8c2035`](https://github.com/portablejs/portable/commit/c8c20356c5cf917cc48c3e66e559a4fa8e80586b)]:
  - @portable/errors@0.1.0
  - @portable/jsonl@0.1.0
