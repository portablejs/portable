---
'@portable/errors': minor
'@portable/arc': minor
'@portable/base64': minor
'@portable/bytes': minor
'@portable/charset': minor
'@portable/compress': minor
'@portable/web-crypto': minor
'@portable/csv': minor
'@portable/dkim': minor
'@portable/dns': minor
'@portable/dns-packet': minor
'@portable/exif': minor
'@portable/idna': minor
'@portable/image-size': minor
'@portable/ip': minor
'@portable/json-stream': minor
'@portable/jsonl': minor
'@portable/lines': minor
'@portable/mail': minor
'@portable/mime-headers': minor
'@portable/mime-stream': minor
'@portable/oauth1': minor
'@portable/password': minor
'@portable/png': minor
'@portable/rdap': minor
'@portable/rpc': minor
'@portable/smtp': minor
'@portable/spf': minor
'@portable/sse': minor
'@portable/streams': minor
'@portable/web-push': minor
'@portable/webhooks': minor
'@portable/websocket': minor
---

Every error class extends a class from the new `@portable/errors` package. `instanceof` against a package's class, and `Errors.is(error, kind)` across packages, work when an app holds two copies of a package. Errors with fields take one object: `new Dns.QueryError({ code, syscall, hostname })`, `new Smtp.CommandError({ code, message, ... })`, `new WebSockets.CloseError({ code, reason })`, `new Webhooks.VerificationError({ reason, message })`, `new Rdap.NotFoundError({ url })`, and the `MaxBytesError` and `MaxLengthError` classes take `{ maxBytes }` or `{ maxLength }`. `ResponseError` in rdap, sse and web-push keeps the whole `response`, and `WebPush.ResponseError` no longer has its own `headers` field: read `error.response.headers`.
