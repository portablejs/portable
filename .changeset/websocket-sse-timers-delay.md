---
'@portable/websockets': patch
'@portable/sse': patch
---

The `delay` option is `Timers.Delay` from `@portable/timers`, and waits use `Timers.backoff` and `Timers.sleep` instead of private copies. `Sse.connect` now throws a `RangeError` for an invalid `delay`, as `WebSockets.connect` does. `Sse.connect.Delay` is removed: use `Timers.Delay`.
