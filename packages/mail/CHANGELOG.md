# @portable/mail

## 0.1.0

### Minor Changes

- [`54a31e0`](https://github.com/portablejs/portable/commit/54a31e004da6c39d4cb9f056b7aefec836457134) - Initial release. `Mail.encodeStream` builds a raw RFC 5322 message, with text and HTML alternatives, attachments, inline images, and custom headers, as a `ReadableStream<Uint8Array>`, and `Mail.envelope` returns its SMTP envelope. Replaces nodemailer's `MailComposer`.

### Patch Changes

- Updated dependencies [[`6b36d08`](https://github.com/portablejs/portable/commit/6b36d08e2331b7e55d90165a4bf6f43961291c8e), [`ef22071`](https://github.com/portablejs/portable/commit/ef22071656ac46dc37c780989da9b1caed3d7375), [`f637257`](https://github.com/portablejs/portable/commit/f637257a41ca66306438256279150ee9e214671a), [`3a566ea`](https://github.com/portablejs/portable/commit/3a566ea00267d6c74313137345532bcc59227b35), [`1e2ecf0`](https://github.com/portablejs/portable/commit/1e2ecf092ce5de40507b2c85c65da7aa4bcbd309), [`c1443c4`](https://github.com/portablejs/portable/commit/c1443c41b978fae46928d1d2f56ee04cfea6601d), [`c04a3b9`](https://github.com/portablejs/portable/commit/c04a3b916eacf40859ed1cd8a4de9544de8208a1)]:
  - @portable/base64@0.1.0
  - @portable/bytes@0.1.0
  - @portable/errors@0.1.0
  - @portable/idna@0.1.0
  - @portable/mime-headers@0.1.0
  - @portable/quoted-printable@0.1.0
  - @portable/timers@0.1.0
