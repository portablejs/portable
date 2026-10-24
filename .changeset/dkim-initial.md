---
'@portable/dkim': minor
---

Added `@portable/dkim`: `Dkim.sign` and `Dkim.verify` for DKIM signatures (RFC 6376) with RSA and Ed25519 keys (RFC 8463), using WebCrypto and an injected DNS resolver. Replaces the DKIM parts of mailauth and nodemailer's DKIM signer.
