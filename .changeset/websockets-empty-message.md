---
'@portable/websockets': patch
---

Fix empty messages in Cloudflare Workers. `fromSocket` and `connect` dropped every empty text or binary message there, and `readable` returned the message after it instead. Workers drops a `ReadableStream` chunk whose strategy size is less than 1, and websockets sized an empty message as 0.

An empty message now counts as 1 toward `maxBuffered` in every runtime, so a flood of empty messages that the reader doesn't read also fails the streams with `MaxBufferedError`.
