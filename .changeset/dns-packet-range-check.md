---
'@portable/dns-packet': patch
---

`encode` throws `InvalidInputError` for a number that isn't an integer in its field's range, such as `port: 70000`. It used to write the value modulo the field's size, so `port: 70000` was sent as 4464.
