---
'@portable/arc': minor
---

Initial release. `Arc.verify` validates a message's ARC chain and `Arc.seal` adds an ARC set (RFC 8617). It signs and verifies with RSA and Ed25519 keys on WebCrypto, and looks up DNS records through a resolver you pass. Replaces the ARC parts of mailauth.
