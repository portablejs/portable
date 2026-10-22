# @portable/errors

The error classes every `@portable/*` package throws, and checks for them that work when an app has duplicate copies of a package. Runs in browsers, Cloudflare Workers, Deno, Bun and Node 24+.

Replaces hand-written `class XError extends Error` hierarchies and the `instanceof` checks that break across duplicate copies of a package.

```sh
npm install @portable/errors
```

```ts
import * as Errors from '@portable/errors'

try {
  const body = await Streams.toBytes(request.body.pipeThrough(Streams.limitBytes(1_000_000)))
  const image = await Compress.decode(body, { maxBytes: 10_000_000 })
} catch (error) {
  if (Errors.is(error, 'MaxBytes')) return new Response(`Over ${error.maxBytes} bytes`, { status: 413 })
  throw error
}
```

`Streams.MaxBytesError` and `Compress.MaxBytesError` are different classes, and `Errors.is(error, 'MaxBytes')` matches both, from any copy of either package.

## Why not `instanceof`

An app can hold two copies of a package: one it depends on and an older one that another dependency pins. viem and ox users hit this. An error thrown by one copy fails `instanceof` against the class from the other. `workspace:*` dependencies are published as exact versions, which npm can't dedupe, so duplicate copies are more likely here than usual.

Each error stores the `kind` of its class and of every class above it under `Symbol.for('portable.error')`. `Symbol.for` returns the same symbol in every copy of every package, other libraries don't set it by accident, and it stays out of `JSON.stringify` and `Object.keys`. The classes define `static [Symbol.hasInstance]` to read it, so `instanceof` works across copies too:

```ts
error instanceof Errors.MaxBytesError // any package's MaxBytesError, from any copy
error instanceof Compress.MaxBytesError // only compress's, from any copy of compress
```

## API

| Export | Does |
| --- | --- |
| `is(error, kind)` | Whether `error` is a `@portable/*` error of `kind`, and narrows its type. `kind` is `'InvalidInput'`, `'Truncated'`, `'Unsupported'`, `'MaxBytes'`, `'MaxLength'` or `'Response'`. |
| `BaseError` | The base class. A subclass sets `static override readonly kind`, which also becomes `name`. Constructed as `new BaseError(message?, { cause })`, like `Error`. |
| `InvalidInputError` | The data a function exists to read, parse, decode, encode or verify is malformed. `new InvalidInputError(message?, { offset, cause })`. |
| `TruncatedError` | Input ended before a value was complete. `new TruncatedError(message?, { offset, cause })`. |
| `UnsupportedError` | Valid input that the package doesn't handle. `new UnsupportedError(message?, { cause })`. |
| `MaxBytesError` | Input or output exceeded a `maxBytes` option. `new MaxBytesError({ maxBytes, message, cause })`. |
| `MaxLengthError` | Text exceeded a `maxLength` option. `new MaxLengthError({ maxLength, message, cause })`. |
| `ResponseError` | A server answered with a status or body the package can't use. `new ResponseError({ response, body, message, cause })`. `status` reads `response.status`. |

An error with only a message takes `(message?, options?)`, as `Error` does. An error with other fields takes one object.

A package subclasses the base class for each error it throws:

```ts
export class MaxBytesError extends Errors.MaxBytesError {
  static override readonly kind: string = 'Compress.MaxBytesError'
}
```

## Types

| Type | Description |
| --- | --- |
| `Kinds` | Maps each kind that `is` accepts to its class. |
| `InvalidInputError.Options`, `MaxBytesError.Options`, `MaxLengthError.Options`, `ResponseError.Options` | The constructor options. |

## Why use this over a hand-written error class

- `instanceof` and `is` work across duplicate copies of a package.
- One check matches the same condition from every package, such as a size limit from streams, compress and exif.
- `ResponseError` keeps the whole `Response`, so a caller can read `Retry-After` and other headers.

## Migrating

| Before | After |
| --- | --- |
| `class XError extends Error { override name = 'Pkg.XError' }` | `class XError extends Errors.InvalidInputError { static override readonly kind: string = 'Pkg.XError' }` |
| `error instanceof Compress.MaxBytesError \|\| error instanceof Streams.MaxBytesError` | `Errors.is(error, 'MaxBytes')` |
