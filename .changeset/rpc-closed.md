---
'@portable/rpc': minor
---

`Rpc.closed(remote)` returns a promise that settles when a connection from `connect` closes. It resolves when the transport's `readable` ends, or for a stream of transports, when the stream ends. It rejects with the reason that waiting calls get when the transport fails, `signal` aborts, or the remote is disposed.
