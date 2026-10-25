# @portable/streams

Collects, combines and transforms web streams and iterables, and makes your own transforms cancellable. It works without `ReadableStream.from` and `for await` over a stream, which some browsers lack. Runs in browsers, Cloudflare Workers, Deno, Bun and Node 24+.

Replaces [get-stream](https://www.npmjs.com/package/get-stream), [concat-stream](https://www.npmjs.com/package/concat-stream), [bl](https://www.npmjs.com/package/bl) (as a collector), [stream-to-array](https://www.npmjs.com/package/stream-to-array), [merge2](https://www.npmjs.com/package/merge2), [merge-stream](https://www.npmjs.com/package/merge-stream), [through2](https://www.npmjs.com/package/through2) and the limit handling of [raw-body](https://www.npmjs.com/package/raw-body).

```sh
npm install @portable/streams
```

```ts
import * as Streams from '@portable/streams';

async function* rows() {
  yield 'a';
  yield 'b';
}

const upper = Streams.transform(async function* (source: AsyncIterable<string>) {
  for await (const chunk of source) {
    yield chunk.toUpperCase();
  }
});

await Streams.toText(Streams.fromIterable(rows()).pipeThrough(upper)); // 'AB'
```

## Collect

Each collector reads a `ReadableStream`, an async iterable (such as a Node `Readable`) or an iterable to the end. It releases the stream's lock when it finishes, and cancels the stream if it stops early.

| Function | Returns |
| --- | --- |
| `toBytes(source, { maxBytes, signal })` | `Uint8Array`. String chunks are encoded as UTF-8. |
| `toBlob(source, { maxBytes, type, signal })` | `Blob` with the given `type`. String chunks are encoded as UTF-8. |
| `toText(source, { maxBytes, encoding, signal })` | `string`. Byte chunks are decoded with `TextDecoder` (`encoding` defaults to `'utf-8'`), and string chunks are kept. |
| `toJson(source, { maxBytes, encoding, signal })` | `JSON.parse` of the text, typed `unknown`. |
| `toArray(source, { signal })` | The chunks, unchanged. |

`toBytes`, `toBlob`, `toText` and `toJson` take `Uint8Array` and `string` chunks, and reject with a `TypeError` for any other chunk. When the source yields more than `maxBytes` bytes (string chunks count as their UTF-8 length), the collector cancels the source and rejects with `MaxBytesError`, whose `maxBytes` property holds the limit. Aborting `signal` cancels the source and rejects with `signal.reason`.

```ts
const body = await Streams.toJson(request.body!, { maxBytes: 100_000 });
```

## Combine

| Function | Does |
| --- | --- |
| `concat(sources, { signal })` | One stream with every chunk of the first source, then every chunk of the second, and so on. A source is read only after the one before it ends. |
| `merge(sources, { signal })` | One stream that reads every source in the array at once and passes chunks on as they arrive. |
| `limitBytes(maxBytes, { signal })` | A `TransformStream` that passes chunks through and fails with `MaxBytesError` once more than `maxBytes` bytes have passed. |
| `tee(source, count, { highWaterMark, unit, signal })` | `count` streams that each receive every chunk of `source`. |

Sources are streams, async iterables or iterables. An error in one source errors the output and cancels the others, and cancelling the output cancels every source.

`tee` splits in the other direction, and differs from `ReadableStream.prototype.tee()` in three ways:

- It makes any number of branches. The platform's `tee()` makes two, so three branches need a chain of two calls.
- It reads the source only as fast as the slowest branch. Once a branch holds `highWaterMark` unread chunks, `tee` stops reading the source until that branch reads, so the fastest branch is at most that far ahead. The platform's `tee()` keeps reading and buffers without limit for a branch that isn't read. `highWaterMark` defaults to 16 chunks. With `unit: 'bytes'` it counts bytes, as `maxBytes` does, and defaults to 65536.
- Cancelling a branch removes it, and `tee` then reads only as fast as the slowest remaining branch. The source is cancelled when every branch is cancelled, with the reason from the last one. The platform's `tee()` does the same, with both reasons in an array.

An error in the source errors every branch. Aborting `signal` errors every branch with `signal.reason` and cancels the source. Branches receive the same chunk objects, as with the platform's `tee()` on a stream that isn't a byte stream, so copy a chunk with `chunk.slice()` before changing it. Because of the limit, reading one branch to the end before reading the next stops after `highWaterMark` chunks. Read the branches at the same time, or pass `highWaterMark: Infinity`.

```ts
const upload = (await request.formData()).get('file') as File;
const [forExif, forStorage, forResize] = Streams.tee(upload.stream(), 3, {
  highWaterMark: 1_000_000,
  unit: 'bytes',
});
await Promise.all([
  Exif.parseStream(forExif), // cancels forExif once it has the metadata
  bucket.put(key, forStorage),
  bucket.put(`${key}.thumb`, resize(forResize)),
]);
```

## Bridge streams and iterables

| Function | Does |
| --- | --- |
| `fromIterable(iterable)` | A `ReadableStream` that pulls one value per read. Cancelling it calls the iterator's `return()`, so a generator's `finally` blocks run. Uses `ReadableStream.from` when the runtime has it. |
| `toAsyncIterable(stream, { preventCancel })` | An async iterator over a stream. Leaving a `for await` loop early cancels the stream, or with `preventCancel: true` only releases the lock. Uses `stream.values()` when the runtime has it. |
| `transform(async function* (source) { ... }, { signal })` | A `{ readable, writable }` pair for `pipeThrough`, built from an async generator that reads `source` and yields output. The generator runs only as fast as the output is read. An error thrown in it errors the output and cancels the input. Cancelling the output ends `source` and runs the generator's `finally` blocks. |
| `map(fn, { signal })`, `filter(fn, { signal })`, `tap(fn, { signal })` | `TransformStream`s that call `fn(chunk, index)`. `fn` may return a promise, and chunks stay in order. |
| `batch(size, { signal })` | A `TransformStream` that groups chunks into arrays of `size`, with a shorter last array. |

Aborting `signal` errors a transform with `signal.reason`, and `pipeThrough` then cancels its source. Aborting the `signal` of `concat` or `merge` errors the output with `signal.reason` and cancels every source. `fromIterable` and `toAsyncIterable` take no signal: cancel the stream they return, or pass `signal` to the `pipeTo` that reads it.

```ts
const lines = Streams.transform(async function* (source: AsyncIterable<string>) {
  let rest = '';
  for await (const chunk of source) {
    const parts = (rest + chunk).split('\n');
    rest = parts.pop()!;
    yield* parts;
  }
  if (rest) {
    yield rest;
  }
});
```

## Cancel your own TransformStream

`abortable(transformer, { signal })` wraps a `Transformer` so that aborting `signal` errors its `TransformStream` with `signal.reason`, and `pipeThrough` then cancels the source. It removes its listener on the signal when the stream ends, is cancelled, or fails because the transformer threw, and returns the transformer unchanged when there is no signal. The stream transforms in lines, base64, csv and the other Portable packages use it to support their `signal` option.

```ts
class UpperCaseStream extends TransformStream<string, string> {
  constructor(options: { signal?: AbortSignal | undefined } = {}) {
    super(
      Streams.abortable(
        { transform: (chunk, controller) => controller.enqueue(chunk.toUpperCase()) },
        options,
      ),
    );
  }
}
```

## Types

| Type | Description |
| --- | --- |
| `Streams.Source` | What the collectors and combinators read: a `ReadableStream`, an async iterable or an iterable. |
| `Streams.abortable.Transformer` | The `Transformer` that `abortable` takes and returns. It adds the optional `cancel` method, which TypeScript's DOM types don't have yet. |

## Why use this over get-stream, concat-stream and merge2

The libraries above were written for Node streams. This package reads web streams with `getReader()`, so it works in every runtime listed above, and it has no dependencies.

- `toBytes` collected 6.8 MB of web stream chunks about 6× faster than get-stream, and about 2× faster than `Response.arrayBuffer()`. `toBlob` ran about 1.7× faster than `Response.blob()`, and `toText` ran at the same speed as get-stream.
- `maxBytes` cancels the source as soon as the limit is crossed. get-stream's `maxBuffer` kept buffering ([get-stream #42](https://github.com/sindresorhus/get-stream/issues/42)), and raw-body's limit became `NaN` for `ArrayBuffer` chunks, which turned it off.
- An error in any source of `concat` or `merge` errors the output and cancels the other sources. merge-stream and merge2 didn't propagate errors ([merge-stream #24](https://github.com/grncdr/merge-stream/issues/24), [merge2 #7](https://github.com/teambition/merge2/issues/7)), and concat-stream never called back when the stream errored ([concat-stream #50](https://github.com/max-mapper/concat-stream/issues/50)).
- Collectors don't need async iteration over `ReadableStream`, which get-stream needed and Chrome lacked ([get-stream #116](https://github.com/sindresorhus/get-stream/issues/116)).
- The collectors reject a number chunk with a `TypeError`. In concat-stream it exposed uninitialized `Buffer` memory ([concat-stream #57](https://github.com/max-mapper/concat-stream/issues/57)).

<!-- bench:start -->
| | @portable/streams | get-stream | concat-stream | bl | stream-to-array | raw-body | merge2 | merge-stream | through2 | Web streams by hand |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Collect 6.8 MB into bytes | 715 | 94.0 | 933 | 973 | – | – | – | – | – | 504 |
| Collect 6.8 MB into bytes with a 10 MB limit | 751 | – | – | – | – | 1,180 | – | – | – | – |
| Collect 6.8 MB into text | 256 | 248 | – | – | – | – | – | – | – | 181 |
| Collect 100,000 objects into an array | 38.7 | 38.8 | – | – | 76.1 | – | – | – | – | – |
| Merge 3 streams of 10,000 objects | 47.9 | – | – | – | – | – | 228 | 219 | – | 26.5 |
| Map 30,000 objects | 45.3 | – | – | – | – | – | – | – | 189 | 46.2 |
| Split 6.8 MB into 3 branches | 803 | – | – | – | – | – | – | – | – | 683 |

Operations per second from `pnpm bench`, higher is better, in Node 24.22.0, on Intel(R) Xeon(R) Processor @ 2.10GHz (4 cores). A dash means the library has no equivalent.

| | @portable/streams | get-stream | concat-stream | bl | stream-to-array | raw-body | merge2 | merge-stream | through2 | Web streams by hand |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Minified and gzipped | 1.7 kB | 2.1 kB | 15 kB | 2.0 kB | 0.9 kB | 4.8 kB | 1.2 kB | 0.8 kB | 25 kB | built in |
| Runtime dependencies | 2 | 2 | 7 | 0 | 1 | 7 | 0 | 0 | 10 | – |
| Node built-ins used | none | `Buffer` | `buffer`, `events`, `util` | `buffer`, `stream` | none | `Buffer`, `async_hooks` | `stream` | `stream` | `buffer`, `events` | none |
| TypeScript types | included | included | `@types/concat-stream` | included | `@types/stream-to-array` | included | `@types/merge2` | `@types/merge-stream` | included | – |
| Version compared | – | 9.0.1 | 2.0.0 | 7.0.12 | 2.3.0 | 4.0.0 | 1.4.1 | 2.0.0 | 5.0.11 | – |

Sizes cover the imports in the usage example, or the equivalent imports of each library, bundled for the browser by `scripts/bundle-size.ts`. Runtime dependencies count every package installed with the published package. A library that uses Node built-ins needs polyfills in a browser and the `nodejs_compat` flag in Cloudflare Workers.
<!-- bench:end -->

- `maxBytes` always counts bytes. get-stream's `maxBuffer` counts characters for `getStream` and elements for `getStreamAsArray`, and `toArray` has no limit.
- raw-body's `limit` accepts a string such as `'1mb'`. `maxBytes` takes a number of bytes, such as `1_000_000`.
- get-stream's `MaxBufferError` carries the data read so far in `bufferedData`. A collector that fails has already cancelled its source and dropped what it read, so its errors carry no data.
- Byte collectors accept only `Uint8Array` (including `Buffer`) and `string` chunks. get-stream also accepted `ArrayBuffer`, `DataView` and other typed arrays, and concat-stream accepted numbers.
- Arrays and other iterables are valid sources. get-stream rejected them.
- merge2 called with several arguments, as in `merge2(a, b, c)`, reads the sources one after another, which is `concat`. `merge` reads them at the same time.
- merge2's `.add()` and the `{ end: false }` option have no equivalent, so pass every source when calling `concat` or `merge`.
- `map` passes on `undefined` like any other value. through2 dropped it. Use `filter` to drop chunks.
- A `transform` generator starts when the output is first read. A through2 transform starts when the first chunk is written.
