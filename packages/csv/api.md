# @portable/csv API

`pnpm api` generates this file from the source. It lists the declarations that each public entry point exports. Don't edit it by hand.

## @portable/csv

```ts
class DecoderStream<const header extends DecoderStream.Header = false, relax extends boolean = false> extends TransformStream<Uint8Array | string, DecoderStream.Row<header, relax>> {
  constructor(options?: DecoderStream.Options<header, relax>);
}
namespace DecoderStream {
  type Header = boolean | readonly string[];
  type Row<header extends Header = false, relax extends boolean = false> = header extends false ? string[] : header extends readonly (infer name extends string)[] ? [
    relax
  ] extends [
    false
  ] ? Record<name, string> : Partial<Record<name, string>> : Record<string, string>;
  type Options<header extends Header = Header, relax extends boolean = boolean> = {
    delimiter?: string | undefined;
    encoding?: string | undefined;
    header?: header | undefined;
    maxLength?: number | undefined;
    quote?: string | false | undefined;
    relaxColumnCount?: relax | undefined;
    skipEmpty?: boolean | undefined;
    signal?: AbortSignal | undefined;
  };
}

class EncoderStream extends TransformStream<encode.Row, Uint8Array<ArrayBuffer>> {
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

class MaxLengthError extends Errors.MaxLengthError {
  static readonly kind: string;
  constructor(options: Errors.MaxLengthError.Options);
}

class TruncatedError extends Errors.TruncatedError {
  static readonly kind: string;
}

function decode<const header extends DecoderStream.Header = false, relax extends boolean = false>(input: string | Uint8Array, options?: decode.Options<header, relax>): DecoderStream.Row<header, relax>[];
namespace decode {
  type Options<header extends DecoderStream.Header = DecoderStream.Header, relax extends boolean = boolean> = Omit<DecoderStream.Options<header, relax>, 'signal'>;
}

function encode(rows: readonly encode.Row[], options?: encode.Options): string;
namespace encode {
  type Value = string | number | boolean | bigint | Date | null | undefined;
  type Row = readonly Value[] | {
    readonly [name: string]: Value;
  };
  type Options = {
    bom?: boolean | undefined;
    delimiter?: string | undefined;
    escapeFormulas?: boolean | undefined;
    header?: boolean | readonly string[] | undefined;
    newline?: '\r\n' | '\n' | undefined;
    quote?: string | false | undefined;
  };
}
```
