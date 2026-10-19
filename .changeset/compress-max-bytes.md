---
'@portable/compress': minor
---

Rename the `maxLength` option to `maxBytes` and `MaxLengthError` to `MaxBytesError`, because the limit counts bytes. Other packages use `maxLength` for string length.
