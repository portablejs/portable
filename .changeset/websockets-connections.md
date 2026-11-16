---
'@portable/websockets': minor
---

Add `WebSockets.connections(url, options)`, which returns a `ReadableStream` with one `{ readable, writable }` pair per connection. When a pair's socket closes, its `readable` delivers the messages it holds and then ends. A write to a closed connection rejects and sends nothing. Use it when you need to know which messages went out on which connection. `connect` is now built on it and behaves as before.
