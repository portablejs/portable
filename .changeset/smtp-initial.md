---
'@portable/smtp': minor
---

Initial release. `Smtp.connect` and `Smtp.send` send mail over SMTP or LMTP, with STARTTLS, AUTH, PIPELINING, and per-recipient results. They open the socket with a `connect` function of type `Sockets.Connect`, such as `connect` from `cloudflare:sockets` or `@portable/sockets/node`. `client.close()` ends the session, and where the runtime has `Symbol.asyncDispose`, `await using client = await Smtp.connect(options)` closes it at the end of the scope. Replaces nodemailer's SMTP transport and smtp-connection.
