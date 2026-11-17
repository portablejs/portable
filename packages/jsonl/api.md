# @portable/jsonl API

`pnpm api` generates this file from the source. It lists the declarations that each public entry point exports. Don't edit it by hand.

## @portable/jsonl

```ts
class DecoderStream extends TransformStream<Uint8Array | string, unknown> {
  constructor(options?: DecoderStream.Options);
}
namespace DecoderStream {
  type Options = {
    signal?: AbortSignal | undefined;
    invalid?: 'error' | 'skip' | undefined;
    maxLength?: number | undefined;
  };
}

class EncoderStream extends TransformStream<unknown, Uint8Array<ArrayBuffer>> {
  constructor(options?: EncoderStream.Options);
}
namespace EncoderStream {
  type Options = {
    signal?: AbortSignal | undefined;
  };
}

class InvalidInputError extends Errors.InvalidInputError {
  static readonly kind: string;
}

class MaxLengthError extends Errors.MaxLengthError {
  static readonly kind: string;
  constructor(options: Errors.MaxLengthError.Options);
}
```
