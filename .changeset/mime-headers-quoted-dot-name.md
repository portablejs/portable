---
'@portable/mime-headers': patch
---

`parseAddresses` with `strict: true` accepts a quoted display name that starts with a dot, such as `".x" <a@b.c>`, which `formatAddresses` writes for the name `.x`. An unquoted name that starts with a dot is still an error.
