# @portable/streams API

`pnpm api` generates this file from the source. It lists the declarations that each public entry point exports. Don't edit it by hand.

## @portable/streams

```ts
class MaxBytesError extends Errors.MaxBytesError {
  static readonly kind: string;
  constructor(options: Errors.MaxBytesError.Options);
}

type Source<chunk> = ReadableStream<chunk> | AsyncIterable<chunk> | Iterable<chunk>;

function abortable<input, output>(
  transformer: abortable.Transformer<input, output>,
  options?: abortable.Options,
): abortable.Transformer<input, output>;
namespace abortable {
  type Options = {
    signal?: AbortSignal | undefined;
  };
  type Transformer<input, output> = globalThis.Transformer<input, output> & {
    cancel?: ((reason: unknown) => void | PromiseLike<void>) | undefined;
  };
}

function batch<chunk>(size: number, options?: batch.Options): TransformStream<chunk, chunk[]>;
namespace batch {
  type Options = {
    signal?: AbortSignal | undefined;
  };
}

function concat<chunk>(
  sources: readonly Source<chunk>[],
  options?: concat.Options,
): ReadableStream<chunk>;
namespace concat {
  type Options = {
    signal?: AbortSignal | undefined;
  };
}

function filter<chunk, state extends chunk>(
  fn: (chunk: chunk, index: number) => chunk is state,
  options?: filter.Options,
): TransformStream<chunk, state>;
function filter<chunk>(
  fn: (chunk: chunk, index: number) => boolean | PromiseLike<boolean>,
  options?: filter.Options,
): TransformStream<chunk, chunk>;
namespace filter {
  type Options = {
    signal?: AbortSignal | undefined;
  };
}

function fromIterable<chunk>(
  iterable: Iterable<chunk | PromiseLike<chunk>> | AsyncIterable<chunk>,
): ReadableStream<chunk>;

function limitBytes<chunk extends Uint8Array | string>(
  maxBytes: number,
  options?: limitBytes.Options,
): TransformStream<chunk, chunk>;
namespace limitBytes {
  type Options = {
    signal?: AbortSignal | undefined;
  };
}

function map<input, output>(
  fn: (chunk: input, index: number) => output | PromiseLike<output>,
  options?: map.Options,
): TransformStream<input, output>;
namespace map {
  type Options = {
    signal?: AbortSignal | undefined;
  };
}

function merge<chunk>(
  sources: readonly Source<chunk>[],
  options?: merge.Options,
): ReadableStream<chunk>;
namespace merge {
  type Options = {
    signal?: AbortSignal | undefined;
  };
}

function tap<chunk>(
  fn: (chunk: chunk, index: number) => void | PromiseLike<void>,
  options?: tap.Options,
): TransformStream<chunk, chunk>;
namespace tap {
  type Options = {
    signal?: AbortSignal | undefined;
  };
}

function tee<chunk>(
  source: Source<chunk>,
  count: number,
  options?: tee.Options,
): ReadableStream<chunk>[];
namespace tee {
  type Options = {
    highWaterMark?: number | undefined;
    unit?: 'chunks' | 'bytes' | undefined;
    signal?: AbortSignal | undefined;
  };
}

function toArray<value>(source: Source<value>, options?: toArray.Options): Promise<value[]>;
namespace toArray {
  type Options = {
    signal?: AbortSignal | undefined;
  };
}

function toAsyncIterable<chunk>(
  stream: ReadableStream<chunk>,
  options?: toAsyncIterable.Options,
): AsyncIterableIterator<chunk>;
namespace toAsyncIterable {
  type Options = {
    preventCancel?: boolean | undefined;
  };
}

function toBlob(source: Source<Uint8Array | string>, options?: toBlob.Options): Promise<Blob>;
namespace toBlob {
  type Options = toBytes.Options & {
    type?: string | undefined;
  };
}

function toBytes(
  source: Source<Uint8Array | string>,
  options?: toBytes.Options,
): Promise<Uint8Array<ArrayBuffer>>;
namespace toBytes {
  type Options = {
    maxBytes?: number | undefined;
    signal?: AbortSignal | undefined;
  };
}

function toJson(source: Source<Uint8Array | string>, options?: toJson.Options): Promise<unknown>;
namespace toJson {
  type Options = toText.Options;
}

function toText(source: Source<Uint8Array | string>, options?: toText.Options): Promise<string>;
namespace toText {
  type Options = {
    encoding?: string | undefined;
    maxBytes?: number | undefined;
    signal?: AbortSignal | undefined;
  };
}

function transform<input, output>(
  fn: (source: AsyncIterable<input>) => AsyncIterable<output>,
  options?: transform.Options,
): ReadableWritablePair<output, input>;
namespace transform {
  type Options = {
    signal?: AbortSignal | undefined;
  };
}
```

## @portable/streams/node

```ts
function toWeb(
  readable: Readable,
  options?: toWeb.Options,
): ReadableStream<Uint8Array<ArrayBuffer>>;
namespace toWeb {
  type Options = {
    signal?: AbortSignal | undefined;
  };
}

function toWebObjects(readable: Readable, options?: toWebObjects.Options): ReadableStream<unknown>;
namespace toWebObjects {
  type Options = toWeb.Options;
}
```
