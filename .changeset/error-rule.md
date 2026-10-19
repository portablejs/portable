---
'@portable/base64': patch
'@portable/csv': minor
'@portable/dkim': patch
'@portable/dns': patch
'@portable/json-stream': patch
'@portable/oauth1': minor
'@portable/png': patch
'@portable/queue': patch
'@portable/smtp': patch
'@portable/spf': patch
'@portable/web-push': patch
'@portable/webhooks': patch
---

Errors for bad arguments follow one rule across packages: `TypeError` for a wrong type or a missing value, `RangeError` for a value an option doesn't accept, including a key or secret that doesn't parse, and `InvalidInputError` for malformed data.

- base64: an unknown `alphabet` or `mode` throws `RangeError` instead of `TypeError`.
- csv: a bad `delimiter`, `quote` or `newline` throws `RangeError`. A value that can't be encoded, or an array row after object rows, throws `Csv.InvalidInputError`.
- dkim: a `privateKey` that doesn't parse or can't sign throws `RangeError`.
- dns: an empty `endpoints` list throws `RangeError`.
- json-stream: an unsupported JSONPath throws `RangeError`.
- oauth1: an RSA key that can't be used throws `RangeError`. `OAuth1.InvalidInputError` is removed.
- png: an invalid `filter` throws `RangeError`.
- queue: a `priority` that isn't a number throws `TypeError`.
- smtp: a `name` with CR or LF, or an invalid `size`, throws `RangeError`.
- spf: an `ip` string that isn't an address throws `RangeError`.
- web-push: a malformed `vapid` key or subject, `urgency` or `topic` throws `RangeError`, and a payload over `maxPayloadBytes` throws `WebPush.InvalidInputError`.
- webhooks: an empty secret or one that isn't base64 throws `RangeError`.
