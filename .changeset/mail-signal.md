---
'@portable/mail': minor
---

`Mail.encode` takes a `signal`. Aborting it errors the result with `signal.reason` and cancels every content stream not yet read. The README shows how to sign the result with `@portable/dkim` and send it with `@portable/smtp`.
