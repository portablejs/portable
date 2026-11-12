---
'@portable/rpc': minor
---

`Rpc.answer` answers one encoded message without a transport and resolves with the encoded reply. `Rpc.notifier` returns a typed proxy that encodes notifications and passes them to a `send` function. Neither keeps state between messages, so a Durable Object that accepts WebSockets with hibernation can answer calls in `webSocketMessage` and push notifications from another request. A method that returns a stream is answered with error code `-32603`, because a stream needs a server that stays in memory. `Rpc.Codec` takes a second type parameter, `received`, for the type `decode` accepts, so `Rpc.json` is now typed as `Codec<string, string | Uint8Array>`.
