---
'@portable/web-push': minor
---

`send` no longer follows redirects. A push service that answers with a 3xx status now throws `ResponseError`, so a redirect can't send the payload and the VAPID token to another host.
