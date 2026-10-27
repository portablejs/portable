# @portable/sse

## 0.1.0

### Minor Changes

- [`eb9c96b`](https://github.com/portablejs/portable/commit/eb9c96b1548a4fa05df54d9f02a7cae52baf7b9b) - Initial release. `Sse.DecoderStream` and `decode` read a `text/event-stream` body into events by the WHATWG rules; `EncoderStream` and `encode` write events and comments; and `connect` opens a stream with `fetch` and reconnects with `Last-Event-ID`, up to `attempts` failures in a row. Replaces eventsource-parser, the eventsource polyfill, @microsoft/fetch-event-source, and the event writers in better-sse and hono's `streamSSE`.

### Patch Changes

- Updated dependencies [[`ef22071`](https://github.com/portablejs/portable/commit/ef22071656ac46dc37c780989da9b1caed3d7375), [`f637257`](https://github.com/portablejs/portable/commit/f637257a41ca66306438256279150ee9e214671a), [`a09a240`](https://github.com/portablejs/portable/commit/a09a240fc290f73902b2ffd85b7ac0fc3460aa97), [`c04a3b9`](https://github.com/portablejs/portable/commit/c04a3b916eacf40859ed1cd8a4de9544de8208a1)]:
  - @portable/bytes@0.1.0
  - @portable/errors@0.1.0
  - @portable/streams@0.1.0
  - @portable/timers@0.1.0
