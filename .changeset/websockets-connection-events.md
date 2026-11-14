---
'@portable/websockets': minor
---

The object `WebSockets.connect` returns now has `addEventListener` and `removeEventListener`, like a `WebSocket`, for `open` and `close` events. `open` is dispatched when a connection is ready, and `close` when a connection that opened ends, before `connect` reconnects. Each event has `sent`, the number of writes passed to a socket so far, so on `close` you can tell which writes went out on the dropped connection. `close` also has the close `code` and `reason`.

`connect` now returns `WebSockets.connect.ReturnType`, a `WebSockets.Duplex` with the two methods, so code that stores the result as a `Duplex` still compiles:

```ts
// Before: a reconnect was visible only through the open option.
const socket = WebSockets.connect(url, { open: () => console.log('connected') });

// After
const socket = WebSockets.connect(url);
socket.addEventListener('open', () => console.log('connected'));
socket.addEventListener('close', ({ code, sent }) => console.log(code, sent));
```
