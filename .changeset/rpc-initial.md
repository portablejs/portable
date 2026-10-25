---
'@portable/rpc': minor
---

Initial release. `Rpc.connect`, `provide`, `call`, `notify` and `withContext` make typed JSON-RPC 2.0 calls over any `{ readable, writable }` transport, with streaming results that apply backpressure, and cancellation through `$/cancel`. Transports cover a `MessagePort`, `Worker` or `BroadcastChannel` (`port`), windows (`window`) and HTTP (`handler` and `http`), and `json` is the default codec. Where the runtime has `Symbol.asyncDispose`, a remote declared with `await using` closes its connection at the end of the scope. Replaces comlink, penpal, post-me, birpc and json-rpc-2.0.
