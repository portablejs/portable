# @portable/streams

Collects, combines, and transforms web streams and iterables, and makes your own transforms cancellable. It works without `ReadableStream.from` and `for await` over a stream, which some browsers lack. Runs in browsers, Cloudflare Workers, Node 24+, Bun, and Deno.

Replaces [get-stream](https://www.npmjs.com/package/get-stream), [concat-stream](https://www.npmjs.com/package/concat-stream), [bl](https://www.npmjs.com/package/bl) (as a collector), [stream-to-array](https://www.npmjs.com/package/stream-to-array), [merge2](https://www.npmjs.com/package/merge2), [merge-stream](https://www.npmjs.com/package/merge-stream), [through2](https://www.npmjs.com/package/through2), and the limit handling of [raw-body](https://www.npmjs.com/package/raw-body). `@portable/streams/node` replaces `Readable.toWeb` from `node:stream`.

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
| `toText(source, { maxBytes, encoding, signal })` | `string`. Byte chunks are decoded with `TextDecoder` (`encoding` defaults to `'utf-8'`), and string chunks are kept. Invalid bytes become U+FFFD, and a leading byte order mark is removed. |
| `toJson(source, { maxBytes, encoding, signal })` | `JSON.parse` of the text, typed `unknown`. Rejects with the `SyntaxError` from `JSON.parse` if the text isn't valid JSON. |
| `toArray(source, { signal })` | The chunks, unchanged. |

`toBytes`, `toBlob`, `toText`, and `toJson` take `Uint8Array` and `string` chunks, and reject with a `TypeError` for any other chunk. When the source yields more than `maxBytes` bytes (string chunks count as their UTF-8 length), the collector cancels the source and rejects with `MaxBytesError`, whose `maxBytes` property holds the limit. Aborting `signal` cancels the source and rejects with `signal.reason`.

```ts
const body = await Streams.toJson(request.body!, { maxBytes: 100_000 });
```

## Combine

| Function | Does |
| --- | --- |
| `concat(sources, { signal })` | One stream with every chunk of the first source, then every chunk of the second, and so on. A source is read only after the one before it ends. Each source is locked only when it is reached. |
| `merge(sources, { signal })` | One stream that reads every source in the array at once and passes chunks on as they arrive. It locks every source when called. |
| `limitBytes(maxBytes, { signal })` | A `TransformStream` that passes chunks through until more than `maxBytes` bytes have passed. It then drops the chunk that crossed the limit, fails with `MaxBytesError`, and cancels the source. String chunks count as their UTF-8 length. Any other kind of chunk errors the stream with a `TypeError`. |
| `tee(source, count, { highWaterMark, unit, signal })` | `count` streams that each receive every chunk of `source`. |

Sources are streams, async iterables, or iterables. An error in one source errors the output and cancels the others, and cancelling the output cancels every source.

`tee` splits in the other direction, and differs from `ReadableStream.prototype.tee()` in three ways:

- It makes any number of branches. The platform's `tee()` makes two, so three branches need a chain of two calls.
- It reads the source only as fast as the slowest branch. Once a branch holds `highWaterMark` unread chunks, `tee` stops reading the source until that branch reads, so the fastest branch is at most that far ahead. The platform's `tee()` keeps reading and buffers without limit for a branch that isn't read. `highWaterMark` defaults to 16 chunks. With `unit: 'bytes'` it counts bytes, as `maxBytes` does, and defaults to 65536.
- Cancelling a branch removes it, and `tee` then reads only as fast as the slowest remaining branch. The source is cancelled when every branch is cancelled, with the reason from the last one. The platform's `tee()` does the same, with both reasons in an array.

An error in the source errors every branch. Aborting `signal` errors every branch with `signal.reason` and cancels the source. Branches receive the same chunk objects, as with the platform's `tee()` on a stream that isn't a byte stream, so copy a chunk with `chunk.slice()` before changing it. Because of the limit, if you read one branch to the end before you read the next, that read stalls once the other branches hold `highWaterMark` chunks, or bytes with `unit: 'bytes'`. Read the branches at the same time, or pass `highWaterMark: Infinity`.

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
| `transform(async function* (source) { ... }, { signal })` | A `{ readable, writable }` pair for `pipeThrough`, built from an async generator that reads `source` and yields output. The generator runs only as fast as the output is read. An error thrown in it errors the output and cancels the input. If the generator returns before `source` ends, the output closes and the input is cancelled. Cancelling the output ends `source` and runs the generator's `finally` blocks. |
| `map(fn, { signal })`, `filter(fn, { signal })`, `tap(fn, { signal })` | `TransformStream`s that call `fn(chunk, index)`. `fn` runs for one chunk at a time. If it returns a promise, the next chunk waits until the promise settles, so chunks stay in order. |
| `batch(size, { signal })` | A `TransformStream` that groups chunks into arrays of `size`, with a shorter last array. `batch` emits a partial array only when the source ends, not on a timer. |

Aborting `signal` errors a transform with `signal.reason`, and `pipeThrough` then cancels its source. Aborting the `signal` of `concat` or `merge` errors the output with `signal.reason` and cancels every source. `fromIterable` and `toAsyncIterable` take no signal. Cancel the stream that `fromIterable` returns, or pass `signal` to the `pipeTo` that reads it, and leave a `toAsyncIterable` loop early to cancel its stream.

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

`abortable(transformer, { signal })` wraps a `Transformer` so that aborting `signal` errors its `TransformStream` with `signal.reason`, and `pipeThrough` then cancels the source. It removes its listener on the signal when the stream ends, is cancelled, or fails because the transformer threw, and returns the transformer unchanged when there is no signal. The stream transforms in lines, base64, csv, and the other Portable packages use it to support their `signal` option.

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

## Convert Node streams

`@portable/streams/node` converts a Node `Readable` to a `ReadableStream`, so web stream APIs and the other Portable packages can read the output of a Node library. It imports `node:stream`, so it runs in Node, Bun, and Deno, and not in browsers or Cloudflare Workers.

```ts
import { createReadStream } from 'node:fs';
import * as NodeStreams from '@portable/streams/node';

const text = await Streams.toText(NodeStreams.toWeb(createReadStream('notes.txt')));
```

| Function | Does |
| --- | --- |
| `toWeb(readable, { signal })` | A `ReadableStream` of plain `Uint8Array`s from a `Readable` of bytes. `Buffer` chunks become `Uint8Array`s, and the strings from a `Readable` with `setEncoding` are encoded back to the bytes they came from. Any other chunk errors the stream with a `TypeError`. |
| `toWebObjects(readable, { signal })` | A `ReadableStream` of the values of an object-mode `Readable`, typed `unknown`. `Buffer` chunks become `Uint8Array`s. |

Both read from the `Readable` only when the stream's reader asks for a chunk, so a slow reader pauses the `Readable`. An error or a `destroy()` on the `Readable` errors the stream, and cancelling the stream destroys the `Readable` with the cancel reason. Aborting `signal` errors the stream with `signal.reason` and destroys the `Readable` with it.

A `Buffer` chunk becomes a `Uint8Array` over the same memory, so the conversion copies no bytes. A small `Buffer` and the `Uint8Array` made from it share Node's buffer pool with other buffers. Don't transfer the chunk's `ArrayBuffer`, because that detaches every other buffer in the pool.

For the other conversions, use the ones in `node:stream`: `Readable.fromWeb` for a `ReadableStream` that a Node API needs to read; `Writable.toWeb` and `Writable.fromWeb` for writables; and `Duplex.toWeb` and `Duplex.fromWeb` for transforms. Keep the work in web streams and convert only where a Node API needs a Node stream, such as a file:

```ts
import { createWriteStream } from 'node:fs';
import { Writable } from 'node:stream';
import * as Csv from '@portable/csv';

const response = await fetch('https://example.com/report.csv');
await response.body!
  .pipeThrough(new Csv.DecoderStream())
  .pipeThrough(Streams.map((row: readonly string[]) => `${row.join('\t')}\n`))
  .pipeThrough(new TextEncoderStream())
  .pipeThrough(new CompressionStream('gzip'))
  .pipeTo(Writable.toWeb(createWriteStream('report.tsv.gz')));
```

## Types

| Type | Description |
| --- | --- |
| `Streams.Source` | What the collectors and combinators read: a `ReadableStream`, an async iterable, or an iterable. |
| `Streams.abortable.Transformer` | The `Transformer` that `abortable` takes and returns. It adds the optional `cancel` method, which TypeScript's DOM types don't have yet. |

## Why use this over get-stream, concat-stream, and merge2

The libraries above were written for Node streams. This package reads web streams with `getReader()`, so it works in every runtime listed above, and it has no dependencies outside `@portable/*`.

- `toBytes` collected 6.8 MB of web stream chunks about 7.6× faster than get-stream, and about 1.4× faster than `Response.arrayBuffer()`. `toBlob` ran about 1.7× faster than `Response.blob()`, and `toText` ran at the same speed as get-stream.
- `maxBytes` cancels the source as soon as the limit is crossed. get-stream's `maxBuffer` kept buffering ([get-stream #42](https://github.com/sindresorhus/get-stream/issues/42)), and raw-body's limit became `NaN` for `ArrayBuffer` chunks, which turned it off.
- An error in any source of `concat` or `merge` errors the output and cancels the other sources. merge-stream and merge2 didn't propagate errors ([merge-stream #24](https://github.com/grncdr/merge-stream/issues/24), [merge2 #7](https://github.com/teambition/merge2/issues/7)), and concat-stream never called back when the stream errored ([concat-stream #50](https://github.com/max-mapper/concat-stream/issues/50)).
- Collectors don't need async iteration over `ReadableStream`, which get-stream needed and Chrome lacked ([get-stream #116](https://github.com/sindresorhus/get-stream/issues/116)).
- The collectors reject a number chunk with a `TypeError`. In concat-stream, a number chunk exposed uninitialized `Buffer` memory ([concat-stream #57](https://github.com/max-mapper/concat-stream/issues/57)).

### Compared with `Readable.toWeb`

`@portable/streams/node` has only the conversion that Node doesn't already do well. Node's `Readable.fromWeb`, `Writable.toWeb`, `Writable.fromWeb`, `Duplex.toWeb`, and `Duplex.fromWeb` follow backpressure and propagate errors, and in a benchmark on Node 24 they ran faster than our versions of them, so this package doesn't wrap them. On Node 24, `NodeStreams.toWeb` differs from `Readable.toWeb` in these ways:

- `Readable.toWeb` passes the strings of a `Readable` with `setEncoding` through as strings, so a `ReadableStream` that should hold bytes holds hex or base64 text. `NodeStreams.toWeb` encodes them back to the original bytes.
- `Readable.toWeb` read 128 KB from a `Readable` before anything read the stream. `NodeStreams.toWeb` reads from the `Readable` only when the stream is read, and it read 6.8 MB about 1.7× faster.
- `Readable.toWeb` takes no `signal`.
- `Readable.toWeb` returns a `ReadableStream<any>`. `NodeStreams.toWeb` returns `ReadableStream<Uint8Array<ArrayBuffer>>`, and `toWebObjects` returns `ReadableStream<unknown>` for an object-mode `Readable`.

<!-- bench:start -->
<table>
<thead><tr><th align="left">Library</th><th align="right">Ops/s</th><th align="left">Relative</th><th></th></tr></thead>
<tbody>
<tr><th colspan="4" align="left">Collect 6.8 MB into bytes</th></tr>
<tr><td>bl</td><td align="right">973</td><td>1.4× faster</td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="160" height="12" alt="" /></td></tr>
<tr><td>concat-stream</td><td align="right">933</td><td>1.3× faster</td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="153" height="12" alt="" /></td></tr>
<tr><td>@portable/streams</td><td align="right">715</td><td></td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="118" height="12" alt="" /></td></tr>
<tr><td>get-stream</td><td align="right">94.0</td><td>7.6× slower</td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="15" height="12" alt="" /></td></tr>
<tr><th colspan="4" align="left">Collect 6.8 MB into bytes with a 10 MB limit</th></tr>
<tr><td>raw-body</td><td align="right">1,180</td><td>1.6× faster</td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="160" height="12" alt="" /></td></tr>
<tr><td>@portable/streams</td><td align="right">751</td><td></td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="102" height="12" alt="" /></td></tr>
<tr><th colspan="4" align="left">Collect 6.8 MB into text</th></tr>
<tr><td>@portable/streams</td><td align="right">256</td><td></td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="160" height="12" alt="" /></td></tr>
<tr><td>get-stream</td><td align="right">248</td><td>same</td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="155" height="12" alt="" /></td></tr>
<tr><th colspan="4" align="left">Collect 100,000 objects into an array</th></tr>
<tr><td>stream-to-array</td><td align="right">76.1</td><td>2.0× faster</td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="160" height="12" alt="" /></td></tr>
<tr><td>get-stream</td><td align="right">38.8</td><td>same</td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="82" height="12" alt="" /></td></tr>
<tr><td>@portable/streams</td><td align="right">38.7</td><td></td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="81" height="12" alt="" /></td></tr>
<tr><th colspan="4" align="left">Merge 3 streams of 10,000 objects</th></tr>
<tr><td>merge2</td><td align="right">228</td><td>4.8× faster</td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="160" height="12" alt="" /></td></tr>
<tr><td>merge-stream</td><td align="right">219</td><td>4.6× faster</td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="154" height="12" alt="" /></td></tr>
<tr><td>@portable/streams</td><td align="right">47.9</td><td></td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="34" height="12" alt="" /></td></tr>
<tr><th colspan="4" align="left">Map 30,000 objects</th></tr>
<tr><td>through2</td><td align="right">189</td><td>4.2× faster</td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="160" height="12" alt="" /></td></tr>
<tr><td>@portable/streams</td><td align="right">45.3</td><td></td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="38" height="12" alt="" /></td></tr>
<tr><th colspan="4" align="left">Split 6.8 MB into 3 branches</th></tr>
<tr><td>@portable/streams</td><td align="right">803</td><td></td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="160" height="12" alt="" /></td></tr>
</tbody>
</table>

Operations per second from `pnpm bench`, higher is better, in Node 24.22.0, on Intel(R) Xeon(R) Processor @ 2.10GHz (4 cores). Each benchmark lists only the libraries that can do the same work, fastest first. The relative speed compares each library with @portable/streams, and the bars are scaled to the fastest library.

| Library | Version | Minified and gzipped | Runtime dependencies | Node built-ins | TypeScript types |
| --- | --- | ---: | ---: | --- | --- |
| @portable/streams | – | 1.7 kB | 2 | none | included |
| get-stream | 9.0.1 | 2.1 kB | 2 | `Buffer` | included |
| concat-stream | 2.0.0 | 15 kB | 7 | `buffer`, `events`, `util` | @types/concat-stream |
| bl | 7.0.12 | 2.0 kB | 0 | `buffer`, `stream` | included |
| stream-to-array | 2.3.0 | 0.9 kB | 1 | none | @types/stream-to-array |
| raw-body | 4.0.0 | 4.8 kB | 7 | `Buffer`, `async_hooks` | included |
| merge2 | 1.4.1 | 1.2 kB | 0 | `stream` | @types/merge2 |
| merge-stream | 2.0.0 | 0.8 kB | 0 | `stream` | @types/merge-stream |
| through2 | 5.0.11 | 25 kB | 10 | `buffer`, `events` | included |

Sizes cover the imports in the usage example, or the equivalent imports of each library, bundled for the browser by `scripts/bundle-size.ts`. Runtime dependencies count every package installed with the published package. A library that uses Node built-ins needs polyfills in a browser and the `nodejs_compat` flag in Cloudflare Workers.
<!-- bench:end -->

- `maxBytes` always counts bytes. get-stream's `maxBuffer` counts characters for `getStream` and elements for `getStreamAsArray`, and `toArray` has no limit.
- raw-body's `limit` accepts a string such as `'1mb'`. `maxBytes` takes a number of bytes, such as `1_000_000`.
- get-stream's `MaxBufferError` stores the data read so far in `bufferedData`. A collector that fails has already cancelled its source and dropped what it read, so its errors don't include that data.
- Byte collectors accept only `Uint8Array` (including `Buffer`) and `string` chunks. get-stream also accepted `ArrayBuffer`, `DataView`, and other typed arrays, and concat-stream accepted numbers.
- Arrays and other iterables are valid sources. get-stream rejected them.
- merge2 called with several arguments, as in `merge2(a, b, c)`, reads the sources one after another, which is `concat`. `merge` reads them at the same time.
- merge2's `.add()` and the `{ end: false }` option have no equivalent, so pass every source when calling `concat` or `merge`.
- `map` passes on `undefined` like any other value. through2 dropped it. Use `filter` to drop chunks.
- A `transform` generator starts when the output is first read. A through2 transform starts when the first chunk is written.
