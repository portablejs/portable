---
'@portable/oauth1': patch
---

RSA-SHA1 signing with a PEM key that imports but can not sign, because its numbers are inconsistent, throws `InvalidInputError` instead of WebCrypto's `OperationError`.
