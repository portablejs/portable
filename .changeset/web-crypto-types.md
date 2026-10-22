---
'@portable/web-crypto': minor
'@portable/webhooks': minor
'@portable/oauth1': minor
'@portable/dkim': minor
'@portable/arc': minor
'@portable/mail-auth': minor
'@portable/web-push': minor
---

`@portable/crypto` is now `@portable/web-crypto`, imported as `WebCrypto`, because `import * as Crypto` shadowed the global `Crypto` class. It defines the `Digest`, `Hmac` and `Hasher` types that the other packages take:

- `Webhooks.Hmac` is called as `hmac('SHA-256', key, data)`.
- `OAuth1.Digest` defaults to `WebCrypto.digest`, and `OAuth1.HashAlgorithm` is removed.
- `Dkim.Hash` is now `Dkim.Hasher`, and the `hash` option of dkim, arc and mail-auth is now `hasher`.
- `WebPush.send.Result` and `Webhooks.verify.Result` are now `ReturnType`.
