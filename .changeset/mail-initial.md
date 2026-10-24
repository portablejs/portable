---
'@portable/mail': minor
---

Added `encodeStream`, which builds a raw RFC 5322 message with text and HTML alternatives, attachments, inline cid images and custom headers as a `ReadableStream<Uint8Array>`, and `envelope`, which returns its SMTP envelope, as a replacement for nodemailer's `MailComposer`.
