---
'@portable/rpc': minor
---

Initial release. `Rpc.connect`, `provide`, `call`, `notify` and `withContext` make typed JSON-RPC 2.0 calls over any `{ readable, writable }` transport, with streaming results that apply backpressure, and cancellation through `$/cancel`. `port` wraps a `MessagePort`, `Worker` or `BroadcastChannel`, `window` connects to another window, `handler` and `http` carry calls over HTTP, and `json` is the default codec. Where the runtime has `Symbol.asyncDispose`, a remote declared with `await using` closes its connection at the end of the scope. Replaces comlink, penpal, post-me, birpc and json-rpc-2.0.
