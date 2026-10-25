---
'@portable/web-push': minor
---

Initial release. `WebPush.send`, `toRequest`, `encrypt` and `generateVapidKeys` send Web Push messages with aes128gcm encryption (RFC 8291) and VAPID (RFC 8292) on WebCrypto and `fetch`, and `maxPayloadBytes` is the largest payload that fits. Replaces web-push.
