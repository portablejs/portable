---
'@portable/queue': patch
'@portable/timers': patch
---

Load in Cloudflare Workers. Both packages created an `AbortController` at the top level of a module, which workerd refuses, so a Worker that imported them, or sse and websockets, failed to start.
