# @portable/errors

## 0.1.0

### Minor Changes

- [#3](https://github.com/portablejs/portable/pull/3) [`f637257`](https://github.com/portablejs/portable/commit/f637257a41ca66306438256279150ee9e214671a) - Initial release. Every `@portable/*` error extends `BaseError` or one of the shared classes `InvalidInputError`, `TruncatedError`, `UnsupportedError`, `MaxBytesError`, `MaxLengthError`, and `ResponseError`, and `Errors.is` checks an error's kind. Each error stores its kinds under `Symbol.for('portable.error')`, so `instanceof` and `is` give the same answer when two copies of a package are installed. Replaces hand-written `class XError extends Error` hierarchies and `instanceof` checks, which fail in that case.
