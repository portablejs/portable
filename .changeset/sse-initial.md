---
'@portable/sse': minor
---

Initial release. `Sse.DecoderStream` and `decode` read a `text/event-stream` body into events by the WHATWG rules; `EncoderStream` and `encode` write events and comments; and `connect` opens a stream with `fetch` and reconnects with `Last-Event-ID`, up to `attempts` failures in a row. Replaces eventsource-parser, the `eventsource` polyfill, @microsoft/fetch-event-source, and the event writers in better-sse and hono's `streamSSE`.
