---
'@portable/rpc': minor
---

`Rpc.serve(api, transport)` is now `Rpc.provide(transport, methods)`, and the `serve` option of `Rpc.connect` is now `methods`.
