---
'@portable/websockets': patch
---

Fix `fromSocket` and `connect` in Cloudflare Workers. Even with the default `maxBuffered` of `Infinity`, both streams failed with `MaxBufferedError` and the socket closed as soon as a message arrived while no read was pending. Workers stores a `ReadableStream` `highWaterMark` as a 32-bit integer, so the `highWaterMark` of `Number.MAX_SAFE_INTEGER` that websockets set wrapped to -1.

websockets now sets the `highWaterMark` to at most `2 ** 31 - 1`. To enforce `maxBuffered`, it compares the queued size with `maxBuffered` instead of checking for a negative `desiredSize`, so a `maxBuffered` above `2 ** 31 - 1` is still enforced at its own value.
