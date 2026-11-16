# @portable/png API

`pnpm api` generates this file from the source. It lists the declarations that each public entry point exports. Don't edit it by hand.

## @portable/png

```ts
type BitDepth = 1 | 2 | 4 | 8 | 16;

type ColorType = 0 | 2 | 3 | 4 | 6;

type Decoded = {
  width: number;
  height: number;
  data: Uint8Array<ArrayBuffer>;
  depth: BitDepth;
  colorType: ColorType;
  interlace: boolean;
  alpha: boolean;
  gamma: number | undefined;
};

type FilterType = 0 | 1 | 2 | 3 | 4;

class InvalidInputError extends Errors.InvalidInputError {
  static readonly kind: string;
}

class MaxPixelsError extends Errors.BaseError {
  static readonly kind: string;
  readonly maxPixels: number;
  constructor(options: ErrorOptions & {
    maxPixels: number;
  });
}

type RgbaImage = {
  width: number;
  height: number;
  data: Uint8Array | Uint8ClampedArray;
  gamma?: number | undefined;
};

class TruncatedError extends Errors.TruncatedError {
  static readonly kind: string;
}

class UnsupportedError extends Errors.UnsupportedError {
  static readonly kind: string;
}

function decode(bytes: Uint8Array, options?: decode.Options): Promise<Decoded>;
namespace decode {
  type Options = {
    checkCrc?: boolean | undefined;
    maxPixels?: number | undefined;
    inflate?: ((data: Uint8Array) => Uint8Array | Promise<Uint8Array>) | undefined;
    signal?: AbortSignal | undefined;
  };
}

function decodeSync(bytes: Uint8Array, options: decodeSync.Options): Decoded;
namespace decodeSync {
  type Options = {
    checkCrc?: boolean | undefined;
    maxPixels?: number | undefined;
    inflate: (data: Uint8Array) => Uint8Array;
  };
}

function encode(image: RgbaImage, options?: encode.Options): Promise<Uint8Array<ArrayBuffer>>;
namespace encode {
  type Options = {
    colorType?: 0 | 2 | 4 | 6 | undefined;
    filter?: FilterType | readonly FilterType[] | undefined;
    background?: {
      red: number;
      green: number;
      blue: number;
    } | undefined;
    deflate?: ((data: Uint8Array) => Uint8Array | Promise<Uint8Array>) | undefined;
    signal?: AbortSignal | undefined;
  };
}

function encodeSync(image: RgbaImage, options: encodeSync.Options): Uint8Array<ArrayBuffer>;
namespace encodeSync {
  type Options = Omit<encode.Options, 'deflate' | 'signal'> & {
    deflate: (data: Uint8Array) => Uint8Array;
  };
}
```
