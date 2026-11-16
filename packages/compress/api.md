# @portable/compress API

`pnpm api` generates this file from the source. It lists the declarations that each public entry point exports. Don't edit it by hand.

## @portable/compress

```ts
class DecoderStream extends TransformStream<Uint8Array, Uint8Array<ArrayBuffer>> {
  readonly readable: ReadableStream<Uint8Array<ArrayBuffer>>;
  readonly writable: WritableStream<Uint8Array>;
  constructor(options?: DecoderStream.Options);
}
namespace DecoderStream {
  type Options = {
    format?: Format | undefined;
    maxBytes?: number | undefined;
    signal?: AbortSignal | undefined;
  };
}

type Format = 'gzip' | 'deflate' | 'deflate-raw';

class InvalidInputError extends Errors.InvalidInputError {
  static readonly kind: string;
  constructor(message?: string, options?: ErrorOptions);
}

class MaxBytesError extends Errors.MaxBytesError {
  static readonly kind: string;
  constructor(options: Errors.MaxBytesError.Options);
}

class TruncatedError extends Errors.TruncatedError {
  static readonly kind: string;
  constructor(message?: string, options?: ErrorOptions);
}

function crc32(data: Uint8Array | string, previous?: number): number;

function decode(data: Uint8Array, options?: decode.Options): Promise<Uint8Array<ArrayBuffer>>;
namespace decode {
  type Options = {
    format?: Format | undefined;
    maxBytes?: number | undefined;
    signal?: AbortSignal | undefined;
  };
}

function encode(data: Uint8Array | string, options?: encode.Options): Promise<Uint8Array<ArrayBuffer>>;
namespace encode {
  type Options = {
    format?: Format | undefined;
    signal?: AbortSignal | undefined;
  };
}
```
