# @portable/exif API

`pnpm api` generates this file from the source. It lists the declarations that each public entry point exports. Don't edit it by hand.

## @portable/exif

```ts
class InvalidInputError extends Errors.InvalidInputError {
  static readonly kind: string;
}

class MaxBytesError extends Errors.MaxBytesError {
  static readonly kind: string;
  constructor(options: Errors.MaxBytesError.Options);
}

type Metadata = Ifds & {
  latitude?: number | undefined;
  longitude?: number | undefined;
  imageSize?:
    | {
        width: number;
        height: number;
      }
    | undefined;
  thumbnail?:
    | {
        offset: number;
        length: number;
        bytes: Uint8Array | undefined;
      }
    | undefined;
};

class StripStream extends TransformStream<Uint8Array, Uint8Array> {
  constructor(options?: StripStream.Options);
}
namespace StripStream {
  type Options = strip.Options & {
    signal?: AbortSignal | undefined;
  };
}

type TagValue = string | number | readonly number[] | Uint8Array;

type Tags = {
  readonly [name: string]: TagValue;
};

class TruncatedError extends Errors.TruncatedError {
  static readonly kind: string;
  constructor(message?: string, options?: ErrorOptions);
}

class UnsupportedError extends Errors.UnsupportedError {
  static readonly kind: string;
  constructor(message?: string, options?: ErrorOptions);
}

function parse(bytes: Uint8Array): Metadata;

function parseDate(value: TagValue | undefined, options?: parseDate.Options): Date | undefined;
namespace parseDate {
  type Options = {
    offset?: TagValue | undefined;
  };
}

function parseStream(
  stream: ReadableStream<Uint8Array>,
  options?: parseStream.Options,
): Promise<Metadata>;
namespace parseStream {
  type Options = {
    maxBytes?: number | undefined;
    signal?: AbortSignal | undefined;
  };
}

function strip(bytes: Uint8Array, options?: strip.Options): Uint8Array<ArrayBuffer>;
namespace strip {
  type Options = {
    keepOrientation?: boolean | undefined;
    keepColorProfile?: boolean | undefined;
  };
}

// Not exported, but used by the exports above.

type Ifds = {
  ifd0: Tags;
  ifd1: Tags;
  exif: Tags;
  gps: Tags;
  interop: Tags;
};
```
