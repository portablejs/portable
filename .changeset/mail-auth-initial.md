---
'@portable/mail-auth': minor
---

Initial release. `MailAuth.authenticate` checks a received message's SPF, DKIM, DMARC, and ARC in one call, writes the Authentication-Results header field (RFC 8601), and can ARC-seal the message with the results. Replaces `authenticate` from mailauth.
