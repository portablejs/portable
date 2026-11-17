---
'@portable/rpc': minor
---

`Rpc.answer` answers one encoded message without a transport and resolves with the encoded reply. `Rpc.notifier` returns a typed proxy that encodes notifications and passes them to a `send` function. Neither keeps state between messages, so a Durable Object that accepts WebSockets with hibernation can answer calls in `webSocketMessage` and push notifications from another request. `answer` can't stream a result, because streaming needs a server that keeps the stream in memory between messages. If a method returns an async iterable or a `ReadableStream`, `answer` cancels it and replies with error code `-32603`. `Rpc.Codec` takes a second type parameter, `received`, for the type `decode` accepts, so `Rpc.json` is now typed as `Codec<string, string | Uint8Array>`.
