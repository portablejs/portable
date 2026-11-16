# @portable/quoted-printable API

`pnpm api` generates this file from the source. It lists the declarations that each public entry point exports. Don't edit it by hand.

## @portable/quoted-printable

```ts
class DecoderStream extends TransformStream<string | Uint8Array, Uint8Array<ArrayBuffer>> {
  constructor(options?: DecoderStream.Options);
}
namespace DecoderStream {
  type Options = {
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

function decode(input: string | Uint8Array): Uint8Array<ArrayBuffer>;

function encode(input: Uint8Array | string, options?: encode.Options): string;
namespace encode {
  type Options = {
    binary?: boolean | undefined;
    lineLength?: number | false | undefined;
  };
}
```
