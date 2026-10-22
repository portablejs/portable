---
'@portable/websockets': minor
---

`@portable/websocket` is now `@portable/websockets`, matching its `WebSockets` namespace. The `retries` option of `connect` is now `attempts`, which counts the first attempt as `Timers.retry` does: `retries: n` becomes `attempts: n + 1`.
