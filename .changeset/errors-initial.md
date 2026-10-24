---
'@portable/errors': minor
---

Added `BaseError` and the shared `InvalidInputError`, `TruncatedError`, `UnsupportedError`, `MaxBytesError`, `MaxLengthError` and `ResponseError` that every `@portable/*` error extends, and `is`, which checks an error's kind. Each error stores its kinds under `Symbol.for('portable.error')`, so `instanceof` and `is` work when an app holds two copies of a package.
