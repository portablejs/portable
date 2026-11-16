# @portable/lines API

`pnpm api` generates this file from the source. It lists the declarations that each public entry point exports. Don't edit it by hand.

## @portable/lines

```ts
class DecoderStream extends TransformStream<Uint8Array | string, string> {
  constructor(options?: DecoderStream.Options);
}
namespace DecoderStream {
  type Options = {
    signal?: AbortSignal | undefined;
    encoding?: string | undefined;
    maxLength?: number | undefined;
    overflow?: 'error' | 'skip' | undefined;
    separator?: Separator | undefined;
    skipEmpty?: boolean | undefined;
  };
}

class MaxLengthError extends Errors.MaxLengthError {
  static readonly kind: string;
  constructor(options: Errors.MaxLengthError.Options);
}

type Separator = string | {
  [Symbol.split](text: string, limit?: number): string[];
};
```
