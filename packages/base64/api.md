# @portable/base64 API

`pnpm api` generates this file from the source. It lists the declarations that each public entry point exports. Don't edit it by hand.

## @portable/base64

```ts
type Alphabet = 'base64' | 'base64url';

class DecoderStream extends TransformStream<string | Uint8Array, Uint8Array<ArrayBuffer>> {
  constructor(options?: DecoderStream.Options);
}
namespace DecoderStream {
  type Options = decode.Options & {
    signal?: AbortSignal | undefined;
  };
}

class EncoderStream extends TransformStream<Uint8Array | string, Uint8Array<ArrayBuffer>> {
  constructor(options?: EncoderStream.Options);
}
namespace EncoderStream {
  type Options = encode.Options & {
    signal?: AbortSignal | undefined;
  };
}

class InvalidInputError extends Errors.InvalidInputError {
  static readonly kind: string;
}

type Mode = 'loose' | 'strict' | 'mime';

class TruncatedError extends Errors.TruncatedError {
  static readonly kind: string;
}

function decode(input: string | Uint8Array, options?: decode.Options): Uint8Array<ArrayBuffer>;
namespace decode {
  type Options = {
    alphabet?: Alphabet | undefined;
    mode?: Mode | undefined;
  };
}

function encode(input: Uint8Array | string, options?: encode.Options): string;
namespace encode {
  type Options = {
    alphabet?: Alphabet | undefined;
    lineLength?: number | false | undefined;
    newline?: string | undefined;
    omitPadding?: boolean | undefined;
  };
}
```
