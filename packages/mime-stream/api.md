# @portable/mime-stream API

`pnpm api` generates this file from the source. It lists the declarations that each public entry point exports. Don't edit it by hand.

## @portable/mime-stream

```ts
type Chunk = {
  type: 'headers' | 'body' | 'preamble' | 'delimiter' | 'epilogue';
  part: Part;
  bytes: Uint8Array;
};

class DecoderStream extends TransformStream<Uint8Array, Chunk> {
  constructor(options?: DecoderStream.Options);
}
namespace DecoderStream {
  type Options = {
    embedded?: boolean | undefined;
    maxBoundaryLineBytes?: number | undefined;
    maxHeaderBytes?: number | undefined;
    maxParts?: number | undefined;
    signal?: AbortSignal | undefined;
  };
}

class EncoderStream extends TransformStream<EncoderStream.Input, Uint8Array> {
  constructor(options?: EncoderStream.Options);
}
namespace EncoderStream {
  type Input = Uint8Array | string | {
    readonly bytes: Uint8Array | string;
  };
  type Options = {
    signal?: AbortSignal | undefined;
  };
}

class MaxBoundaryLineBytesError extends Errors.MaxBytesError {
  static readonly kind: string;
  readonly maxBoundaryLineBytes: number;
  constructor(options: ErrorOptions & {
    maxBoundaryLineBytes: number;
  });
}

class MaxHeaderBytesError extends Errors.MaxBytesError {
  static readonly kind: string;
  readonly maxHeaderBytes: number;
  constructor(options: ErrorOptions & {
    maxHeaderBytes: number;
  });
}

class MaxPartsError extends Errors.BaseError {
  static readonly kind: string;
  readonly maxParts: number;
  constructor(options: ErrorOptions & {
    maxParts: number;
  });
}

type Part = {
  parent?: Part | undefined;
  headers: readonly MimeHeaders.Header[];
  contentType: string;
  encoding: string;
  boundary?: string | undefined;
};

function splitHeaders(stream: ReadableStream<Uint8Array>, options?: splitHeaders.Options): Promise<splitHeaders.ReturnType>;
namespace splitHeaders {
  type Options = {
    maxHeaderBytes?: number | undefined;
    signal?: AbortSignal | undefined;
  };
  type ReturnType = {
    headers: Uint8Array<ArrayBuffer>;
    body: ReadableStream<Uint8Array>;
  };
}
```
