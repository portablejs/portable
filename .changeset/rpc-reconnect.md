---
'@portable/rpc': minor
---

`Rpc.connect` takes a stream of transports, one per connection, such as the stream from `WebSockets.connections`. It sends on the newest transport and holds calls made between transports. When a transport's `readable` ends, the calls whose requests went out on it reject with `Rpc.TransportError`, instead of waiting forever.

```ts
// Before: a call whose request was lost in a reconnect never settled.
const room = Rpc.connect<RoomApi>(WebSockets.connect(url));

// After
const room = Rpc.connect<RoomApi>(WebSockets.connections(url));
```
