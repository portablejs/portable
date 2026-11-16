# @portable/image-size API

`pnpm api` generates this file from the source. It lists the declarations that each public entry point exports. Don't edit it by hand.

## @portable/image-size

```ts
type Image = {
  width: number;
  height: number;
  type?: string | undefined;
};

class InvalidInputError extends Errors.InvalidInputError {
  static readonly kind: string;
}

class MaxBytesError extends Errors.MaxBytesError {
  static readonly kind: string;
  constructor(options: Errors.MaxBytesError.Options);
}

type Size = {
  width: number;
  height: number;
  type: Type;
  orientation?: number | undefined;
  images?: readonly Image[] | undefined;
};

class TruncatedError extends Errors.TruncatedError {
  static readonly kind: string;
  constructor(message?: string, options?: ErrorOptions);
}

type Type = 'avif' | 'avis' | 'bigtiff' | 'bmp' | 'cur' | 'dds' | 'gif' | 'heic' | 'heix' | 'hevc' | 'hevx' | 'icns' | 'ico' | 'j2c' | 'jp2' | 'jpg' | 'jxl' | 'jxl-stream' | 'ktx' | 'ktx2' | 'mif1' | 'msf1' | 'png' | 'pnm' | 'psd' | 'svg' | 'tga' | 'tiff' | 'webp';

class UnsupportedError extends Errors.UnsupportedError {
  static readonly kind: string;
  constructor(message?: string, options?: ErrorOptions);
}

function parse(bytes: Uint8Array): Size;

function parseStream(stream: ReadableStream<Uint8Array>, options?: parseStream.Options): Promise<Size>;
namespace parseStream {
  type Options = {
    maxBytes?: number | undefined;
    signal?: AbortSignal | undefined;
  };
}
```
