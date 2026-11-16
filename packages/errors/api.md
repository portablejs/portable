# @portable/errors API

`pnpm api` generates this file from the source. It lists the declarations that each public entry point exports. Don't edit it by hand.

## @portable/errors

```ts
class BaseError extends Error {
  static [Symbol.hasInstance]: (value: unknown) => boolean;
  static readonly kind: string;
  constructor(message?: string, options?: ErrorOptions);
  static [Symbol.hasInstance](value: unknown): boolean;
}

class InvalidInputError extends BaseError {
  static readonly kind: string;
  readonly offset: number | undefined;
  constructor(message?: string, options?: InvalidInputError.Options);
}
namespace InvalidInputError {
  type Options = ErrorOptions & {
    offset?: number | undefined;
  };
}

type Kinds = {
  InvalidInput: InvalidInputError;
  Truncated: TruncatedError;
  Unsupported: UnsupportedError;
  MaxBytes: MaxBytesError;
  MaxLength: MaxLengthError;
  Response: ResponseError;
};

class MaxBytesError extends BaseError {
  static readonly kind: string;
  readonly maxBytes: number;
  constructor(options: MaxBytesError.Options);
}
namespace MaxBytesError {
  type Options = ErrorOptions & {
    maxBytes: number;
    message?: string | undefined;
  };
}

class MaxLengthError extends BaseError {
  static readonly kind: string;
  readonly maxLength: number;
  constructor(options: MaxLengthError.Options);
}
namespace MaxLengthError {
  type Options = ErrorOptions & {
    maxLength: number;
    message?: string | undefined;
  };
}

class ResponseError extends BaseError {
  static readonly kind: string;
  readonly response: Response;
  readonly body: unknown;
  constructor(options: ResponseError.Options);
  get status(): number;
}
namespace ResponseError {
  type Options = ErrorOptions & {
    response: Response;
    body?: unknown;
    message?: string | undefined;
  };
}

class TruncatedError extends BaseError {
  static readonly kind: string;
  readonly offset: number | undefined;
  constructor(message?: string, options?: TruncatedError.Options);
}
namespace TruncatedError {
  type Options = ErrorOptions & {
    offset?: number | undefined;
  };
}

class UnsupportedError extends BaseError {
  static readonly kind: string;
}

function is<kind extends keyof Kinds>(error: unknown, kind: kind): error is Kinds[kind];
```
