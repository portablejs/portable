---
'@portable/smtp': minor
---

Added `connect` and `send`, an SMTP and LMTP client over an injected socket with the shape of the WinterTC Sockets API, as a replacement for nodemailer's SMTP transport and smtp-connection. `Client.close()` ends the session, and where the runtime has `Symbol.asyncDispose`, `await using client = await Smtp.connect(options)` closes it at the end of the scope.
