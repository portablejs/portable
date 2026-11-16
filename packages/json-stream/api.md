# @portable/json-stream API

`pnpm api` generates this file from the source. It lists the declarations that each public entry point exports. Don't edit it by hand.

## @portable/json-stream

```ts
class DecoderStream extends TransformStream<Uint8Array | string, DecoderStream.Match> {
  constructor(options?: DecoderStream.Options);
}
namespace DecoderStream {
  type Options = {
    signal?: AbortSignal | undefined;
    paths?: readonly string[] | undefined;
    maxLength?: number | undefined;
  };
  type Match = {
    path: (string | number)[];
    value: unknown;
  };
}

class InvalidInputError extends Errors.InvalidInputError {
  static readonly kind: string;
}

class MaxLengthError extends Errors.MaxLengthError {
  static readonly kind: string;
  constructor(options: Errors.MaxLengthError.Options);
}

class TruncatedError extends Errors.TruncatedError {
  static readonly kind: string;
  constructor(message?: string, options?: ErrorOptions);
}

function encodeStream(value: unknown, options?: encodeStream.Options): ReadableStream<Uint8Array<ArrayBuffer>>;
namespace encodeStream {
  type Replacer = (this: unknown, key: string, value: unknown) => unknown;
  type Options = {
    replacer?: Replacer | readonly (string | number)[] | undefined;
    space?: string | number | undefined;
    signal?: AbortSignal | undefined;
  };
}
```
