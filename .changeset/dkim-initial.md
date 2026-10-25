---
'@portable/dkim': minor
---

Initial release. `Dkim.sign` and `Dkim.verify` sign and verify DKIM signatures (RFC 6376) with RSA and Ed25519 keys (RFC 8463) on WebCrypto. `verify` looks up public keys through a DNS resolver you pass. Replaces the DKIM parts of mailauth and nodemailer's DKIM signer.
