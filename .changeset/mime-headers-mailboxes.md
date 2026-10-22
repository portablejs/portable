---
'@portable/mime-headers': minor
'@portable/mail-auth': patch
---

`MimeHeaders.parseMailboxes(text)` replaces `parseAddresses(text, { flatten: true })`, so each function has one return type.
