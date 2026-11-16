# @portable/binary API

`pnpm api` generates this file from the source. It lists the declarations that each public entry point exports. Don't edit it by hand.

## @portable/binary

```ts
type Endian = 'big' | 'little';

class FrameDecoderStream extends TransformStream<Uint8Array, Uint8Array<ArrayBuffer>> {
  constructor(options?: FrameDecoderStream.Options);
}
namespace FrameDecoderStream {
  type Options = {
    signal?: AbortSignal | undefined;
    prefix?: Prefix | undefined;
    endian?: Endian | undefined;
    maxBytes?: number | undefined;
  };
}

class FrameEncoderStream extends TransformStream<Uint8Array, Uint8Array<ArrayBuffer>> {
  constructor(options?: FrameEncoderStream.Options);
}
namespace FrameEncoderStream {
  type Options = {
    signal?: AbortSignal | undefined;
    prefix?: Prefix | undefined;
    endian?: Endian | undefined;
  };
}

class InvalidInputError extends Errors.InvalidInputError {
  static readonly kind: string;
}

class MaxBytesError extends Errors.MaxBytesError {
  static readonly kind: string;
  constructor(options: Errors.MaxBytesError.Options);
}

type Prefix = 'uint8' | 'uint16' | 'uint32' | 'varint';

type Reader = {
  offset: number;
  endian: Endian;
  readonly length: number;
  readonly remaining: number;
  uint8(): number;
  int8(): number;
  uint16(): number;
  int16(): number;
  uint32(): number;
  int32(): number;
  bigUint64(): bigint;
  bigInt64(): bigint;
  float32(): number;
  float64(): number;
  uint(byteLength: number): number;
  int(byteLength: number): number;
  varint(options?: Reader.VarintOptions): number;
  bigVarint(options?: Reader.VarintOptions): bigint;
  bytes(byteLength: number): Uint8Array;
  string(byteLength: number, options?: Reader.StringOptions): string;
  cstring(options?: Reader.StringOptions): string;
  skip(byteLength: number): void;
};
namespace Reader {
  type VarintOptions = {
    encoding?: VarintEncoding | undefined;
  };
  type StringOptions = {
    fatal?: boolean | undefined;
  };
}

class TruncatedError extends Errors.TruncatedError {
  static readonly kind: string;
}

type VarintEncoding = 'unsigned' | 'zigzag' | 'signed';

type Writer = {
  offset: number;
  endian: Endian;
  readonly length: number;
  uint8(value: number): void;
  int8(value: number): void;
  uint16(value: number): void;
  int16(value: number): void;
  uint32(value: number): void;
  int32(value: number): void;
  bigUint64(value: bigint): void;
  bigInt64(value: bigint): void;
  float32(value: number): void;
  float64(value: number): void;
  uint(byteLength: number, value: number): void;
  int(byteLength: number, value: number): void;
  varint(value: number, options?: Writer.VarintOptions): void;
  bigVarint(value: bigint, options?: Writer.VarintOptions): void;
  bytes(value: Uint8Array): void;
  string(text: string): void;
  cstring(text: string): void;
  toBytes(): Uint8Array<ArrayBuffer>;
};
namespace Writer {
  type VarintOptions = {
    encoding?: VarintEncoding | undefined;
  };
}

function createReader(bytes: Uint8Array, options?: createReader.Options): Reader;
namespace createReader {
  type Options = {
    endian?: Endian | undefined;
  };
}

function createWriter(options?: createWriter.Options): Writer;
namespace createWriter {
  type Options = {
    endian?: Endian | undefined;
  };
}

function utf8Length(text: string): number;
```
