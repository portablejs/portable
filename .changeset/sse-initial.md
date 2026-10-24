---
'@portable/sse': minor
---

Added `@portable/sse` for server-sent events. `DecoderStream` and `decode` read a `text/event-stream` body into events by the WHATWG rules, `EncoderStream` and `encode` write events and comments, and `connect` opens a stream with `fetch` and reconnects with `Last-Event-ID`. Replaces eventsource-parser, the `eventsource` polyfill, @microsoft/fetch-event-source, and the event writers in better-sse and hono's `streamSSE`.
