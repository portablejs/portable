---
'@portable/mailauth': minor
---

Add `authenticate`, which checks a received message's SPF, DKIM, DMARC and ARC, writes the Authentication-Results header field (RFC 8601) and ARC-seals the message with the results.
