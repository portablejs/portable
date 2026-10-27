# @portable/smtp

## 0.1.0

### Minor Changes

- [`425cfb9`](https://github.com/portablejs/portable/commit/425cfb9c33f82b1a8cdecebf9eeb5585e3df754b) - Initial release. `Smtp.connect` and `Smtp.send` send mail over SMTP or LMTP, with STARTTLS, AUTH, PIPELINING, and per-recipient results. They open the socket with a `connect` function of type `Sockets.Connect`, such as `connect` from `cloudflare:sockets` or `@portable/sockets/node`. `client.close()` ends the session, and where the runtime has `Symbol.asyncDispose`, `await using client = await Smtp.connect(options)` closes it at the end of the scope. Replaces nodemailer's SMTP transport and smtp-connection.

### Patch Changes

- Updated dependencies [[`6b36d08`](https://github.com/portablejs/portable/commit/6b36d08e2331b7e55d90165a4bf6f43961291c8e), [`ef22071`](https://github.com/portablejs/portable/commit/ef22071656ac46dc37c780989da9b1caed3d7375), [`f637257`](https://github.com/portablejs/portable/commit/f637257a41ca66306438256279150ee9e214671a), [`b2d6cb3`](https://github.com/portablejs/portable/commit/b2d6cb3e0e0588f159df726b8fd2f1cf228b6d32)]:
  - @portable/base64@0.1.0
  - @portable/bytes@0.1.0
  - @portable/errors@0.1.0
  - @portable/sockets@0.1.0
