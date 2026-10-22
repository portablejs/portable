---
'@portable/websockets': patch
---

`connect` and `fromSocket` work in Cloudflare Workers with the default `maxBuffered`. workerd rejects a stream `highWaterMark` of `Infinity`, so both threw a `TypeError`.
