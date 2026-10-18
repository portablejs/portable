---
'@portable/lines': minor
---

Renamed `OverflowError` to `MaxLengthError` (name `'Lines.MaxLengthError'`), matching `@portable/streams`' `MaxBytesError`. It now stores the exceeded `maxLength`.
