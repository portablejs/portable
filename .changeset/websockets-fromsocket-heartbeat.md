---
'@portable/websockets': minor
---

`fromSocket` takes the `heartbeat` option that `connect` has. Pings start when the socket opens, and pongs don't reach `readable`. When a reply doesn't arrive in time, `fromSocket` closes the socket with 1000 and fails both streams with a `TimeoutError` `DOMException`, because it can't reconnect.

`Socket.bufferedAmount` is optional, so a Cloudflare Workers `WebSocket`, which has none, type-checks as a `Socket`. On a socket without it, each write is sent at once.
