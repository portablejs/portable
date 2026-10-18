---
'@portable/mime-headers': patch
---

`parseAddresses` with `strict: true` accepts a group named by an empty quoted string (`"":;`), which RFC 5322 allows and `formatAddresses` writes for a group whose name is `''`.
