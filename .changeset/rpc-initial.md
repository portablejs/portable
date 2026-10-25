---
'@portable/rpc': minor
---

Added `@portable/rpc`: typed JSON-RPC 2.0 calls over any `{ readable, writable }` transport, with `connect`, `provide`, `call`, `notify` and `withContext`, streaming results with backpressure, `$/cancel`, and transports for `MessagePort`, `Worker`, `BroadcastChannel`, windows (`window`) and HTTP (`handler` and `http`). Where the runtime has `Symbol.asyncDispose`, a remote declared with `await using` closes its connection at the end of the scope. It replaces comlink, penpal, post-me, birpc and json-rpc-2.0.
