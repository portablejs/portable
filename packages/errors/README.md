# @portable/errors

The shared error classes for `@portable/*` packages, and `is`, which checks an error's kind even when an app installs two copies of a package. Runs in browsers, Cloudflare Workers, Deno, Bun and Node 24+.

Replaces hand-written `class XError extends Error` hierarchies and `instanceof` checks, which fail when an app has two copies of a package.

```sh
npm install @portable/errors
```

```ts
import * as Errors from '@portable/errors'

try {
  const body = await Streams.toBytes(request.body.pipeThrough(Streams.limitBytes(1_000_000)))
  const image = await Compress.decode(body, { maxBytes: 10_000_000 })
} catch (error) {
  if (Errors.is(error, 'MaxBytes')) {
    return new Response(`Over ${error.maxBytes} bytes`, { status: 413 })
  }
  throw error
}
```

`Streams.MaxBytesError` and `Compress.MaxBytesError` are different classes, and `Errors.is(error, 'MaxBytes')` matches both, from any copy of either package.

## Why not `instanceof`

An app can end up with two copies of a package, for example when the app needs version 2 of a package and one of its dependencies needs version 1. An error thrown by one copy then fails `instanceof` against the class from the other copy. `@portable/*` packages depend on each other at exact versions, because pnpm publishes `workspace:*` that way, and npm installs a separate copy for each exact version it is asked for. Two copies are therefore more likely with these packages than with most.

Each error stores its class's `kind`, and the `kind` of every parent class, under `Symbol.for('portable.error')`. `Symbol.for` returns the same symbol in every copy of every package. Other libraries don't set this key by accident, and `JSON.stringify` and `Object.keys` skip it. The classes define `static [Symbol.hasInstance]` to read it, so `instanceof` works across copies too:

```ts
error instanceof Errors.MaxBytesError // any package's MaxBytesError, from any copy
error instanceof Compress.MaxBytesError // only compress's, from any copy of compress
```

## API

| Export | Does |
| --- | --- |
| `is(error, kind)` | Whether `error` is a `@portable/*` error of `kind`, and narrows its type. `kind` is `'InvalidInput'`, `'Truncated'`, `'Unsupported'`, `'MaxBytes'`, `'MaxLength'` or `'Response'`. |
| `BaseError` | The base class. A subclass sets `static override readonly kind`, and the constructor copies it to `name`. Constructed as `new BaseError(message?, { cause })`, like `Error`. |
| `InvalidInputError` | The main input of a function is malformed, such as bytes that don't decode or a header that doesn't parse. `new InvalidInputError(message?, { offset, cause })`. |
| `TruncatedError` | Input ended before a value was complete. `new TruncatedError(message?, { offset, cause })`. |
| `UnsupportedError` | The input is valid, but the package doesn't handle it. `new UnsupportedError(message?, { cause })`. |
| `MaxBytesError` | Input or output exceeded a `maxBytes` option. `new MaxBytesError({ maxBytes, message, cause })`. |
| `MaxLengthError` | Text exceeded a `maxLength` option. `new MaxLengthError({ maxLength, message, cause })`. |
| `ResponseError` | The package can't use the status or body of a server's response. `new ResponseError({ response, body, message, cause })`. `status` reads `response.status`. |

An error with only a message takes `(message?, options?)`, as `Error` does. An error with other fields takes one object.

A package defines each error it throws as a subclass of one of these classes:

```ts
export class MaxBytesError extends Errors.MaxBytesError {
  static override readonly kind: string = 'Compress.MaxBytesError'
}
```

## Types

| Type | Description |
| --- | --- |
| `Kinds` | Maps each kind accepted by `is` to its class. |
| `InvalidInputError.Options`, `MaxBytesError.Options`, `MaxLengthError.Options`, `ResponseError.Options` | The constructor options. |

## Why use this over a hand-written error class

- `instanceof` and `is` give the same answer when an app has two copies of a package.
- `Errors.is(error, 'MaxBytes')` matches an exceeded size limit from streams, compress, exif or any other package.
- `ResponseError` keeps the whole `Response`, so a caller can read `Retry-After` and other headers.

## Migrating

| Before | After |
| --- | --- |
| `class XError extends Error { override name = 'Pkg.XError' }` | `class XError extends Errors.InvalidInputError { static override readonly kind: string = 'Pkg.XError' }` |
| `error instanceof Compress.MaxBytesError \|\| error instanceof Streams.MaxBytesError` | `Errors.is(error, 'MaxBytes')` |
