---
'@portable/errors': minor
---

Added `BaseError` and the shared `InvalidInputError`, `TruncatedError`, `UnsupportedError`, `MaxBytesError`, `MaxLengthError` and `ResponseError`, which every `@portable/*` error extends. Also added `is`, which checks an error's kind. Each error stores its kinds under `Symbol.for('portable.error')`, so `instanceof` and `is` give the same answer when an app holds two copies of a package.
