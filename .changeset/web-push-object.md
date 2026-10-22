---
'@portable/web-push': minor
---

`send`, `toRequest` and `encrypt` take one object: `WebPush.send({ subscription, payload, vapid, ttl })`. Leave out `payload` to send a push with no data, instead of passing `undefined`.
