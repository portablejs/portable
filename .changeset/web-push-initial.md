---
'@portable/web-push': minor
---

Added `send`, `toRequest`, `encrypt` and `generateVapidKeys`, which send Web Push messages with aes128gcm encryption (RFC 8291) and VAPID (RFC 8292) on WebCrypto and `fetch`, as a replacement for web-push.
