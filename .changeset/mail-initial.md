---
'@portable/mail': minor
---

Initial release. `Mail.encodeStream` builds a raw RFC 5322 message, with text and HTML alternatives, attachments, inline images, and custom headers, as a `ReadableStream<Uint8Array>`, and `Mail.envelope` returns its SMTP envelope. Replaces nodemailer's `MailComposer`.
