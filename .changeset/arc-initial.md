---
'@portable/arc': minor
---

Initial release. `Arc.verify` validates a message's ARC chain and `Arc.seal` adds an ARC set (RFC 8617). Both take RSA and Ed25519 keys and sign or verify on WebCrypto, and `verify` looks up public keys through a DNS resolver you pass. Replaces the ARC parts of mailauth.
