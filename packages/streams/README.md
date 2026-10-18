# @portable/streams

Collects, combines and transforms web streams and iterables. Runs in browsers, Cloudflare Workers, Deno, Bun and Node 24+, including browsers that lack `ReadableStream.from` and `for await` over a stream.

Replaces [get-stream](https://www.npmjs.com/package/get-stream), [concat-stream](https://www.npmjs.com/package/concat-stream), [bl](https://www.npmjs.com/package/bl) (as a collector), [stream-to-array](https://www.npmjs.com/package/stream-to-array), [merge2](https://www.npmjs.com/package/merge2), [merge-stream](https://www.npmjs.com/package/merge-stream), [through2](https://www.npmjs.com/package/through2) and the limit handling of [raw-body](https://www.npmjs.com/package/raw-body).

## Why use this over get-stream and the others

The libraries above were written for Node streams. This package reads web streams with `getReader()`, so it works in every runtime listed above, and it has no dependencies.

- `toBytes` collected 6.8 MB of web stream chunks about 6× faster than get-stream, and about 2× faster than `Response.arrayBuffer()`. `toText` ran at the same speed as get-stream.
- `maxBytes` cancels the source as soon as the limit is crossed. get-stream's `maxBuffer` kept buffering ([get-stream #42](https://github.com/sindresorhus/get-stream/issues/42)), and raw-body's limit became `NaN` for `ArrayBuffer` chunks, which turned it off.
- An error in any source of `concat` or `merge` errors the output and cancels the other sources. merge-stream and merge2 didn't propagate errors ([merge-stream #24](https://github.com/grncdr/merge-stream/issues/24), [merge2 #7](https://github.com/teambition/merge2/issues/7)), and concat-stream never called back when the stream errored ([concat-stream #50](https://github.com/max-mapper/concat-stream/issues/50)).
- Collectors don't need async iteration over `ReadableStream`, which get-stream needed and Chrome lacked ([get-stream #116](https://github.com/sindresorhus/get-stream/issues/116)).
- A number chunk is a `TypeError`. In concat-stream it exposed uninitialized `Buffer` memory ([concat-stream #57](https://github.com/max-mapper/concat-stream/issues/57)).

```sh
npm install @portable/streams
```

```ts
import * as Streams from '@portable/streams'

async function* rows() {
  yield 'a'
  yield 'b'
}

const upper = Streams.transform(async function* (source: AsyncIterable<string>) {
  for await (const chunk of source) yield chunk.toUpperCase()
})

await Streams.toText(Streams.fromIterable(rows()).pipeThrough(upper)) // 'AB'
```

## Collect

Each collector reads a `ReadableStream`, an async iterable (such as a Node `Readable`) or an iterable to the end. It releases the stream's lock when it finishes, and cancels the stream if it stops early.

| Function | Returns |
| --- | --- |
| `toBytes(source, { maxBytes })` | `Uint8Array`. String chunks are encoded as UTF-8. |
| `toText(source, { maxBytes, encoding })` | `string`. Byte chunks are decoded with `TextDecoder` (`encoding` defaults to `'utf-8'`), and string chunks are kept. |
| `toJson(source, { maxBytes, encoding })` | `JSON.parse` of the text, typed `unknown`. |
| `toArray(source)` | The chunks, unchanged. |

`toBytes`, `toText` and `toJson` take `Uint8Array` and `string` chunks; any other chunk rejects with a `TypeError`. When the source yields more than `maxBytes` bytes (string chunks count as their UTF-8 length), the collector cancels the source and rejects with `MaxBytesError`, whose `maxBytes` property holds the limit.

```ts
const body = await Streams.toJson(request.body!, { maxBytes: 100_000 })
```

## Combine

| Function | Does |
| --- | --- |
| `concat(...sources)` | One stream with every chunk of the first source, then the next. A source is read only after the one before it ends. |
| `merge(...sources)` | One stream that reads every source at once and passes chunks on as they arrive. |
| `limitBytes(maxBytes)` | A `TransformStream` that passes chunks through and fails with `MaxBytesError` once more than `maxBytes` bytes have passed. |

Sources are streams, async iterables or iterables. An error in one source errors the output and cancels the others, and cancelling the output cancels every source.

## Bridge streams and iterables

| Function | Does |
| --- | --- |
| `fromIterable(iterable)` | A `ReadableStream` that pulls one value per read. Cancelling it calls the iterator's `return()`, so a generator's `finally` blocks run. Uses `ReadableStream.from` when the runtime has it. |
| `toAsyncIterable(stream, { preventCancel })` | An async iterator over a stream. Leaving a `for await` loop early cancels the stream, or with `preventCancel: true` only releases the lock. Uses `stream.values()` when the runtime has it. |
| `transform(async function* (source) { ... })` | A `{ readable, writable }` pair for `pipeThrough`, built from an async generator that reads `source` and yields output. The generator runs only as fast as the output is read. An error thrown in it errors the output and cancels the input; cancelling the output ends `source` and runs the generator's `finally` blocks. |
| `map(fn)`, `filter(fn)`, `tap(fn)` | `TransformStream`s that call `fn(chunk, index)`. `fn` may return a promise; chunks stay in order. |
| `batch(size)` | A `TransformStream` that groups chunks into arrays of `size`, with a shorter last array. |

```ts
const lines = Streams.transform(async function* (source: AsyncIterable<string>) {
  let rest = ''
  for await (const chunk of source) {
    const parts = (rest + chunk).split('\n')
    rest = parts.pop()!
    yield* parts
  }
  if (rest) yield rest
})
```

## Migrating

| Before | @portable/streams |
| --- | --- |
| `await getStream(stream)` | `await toText(stream)` |
| `await getStreamAsBuffer(stream)`, `getStreamAsArrayBuffer(stream)` | `await toBytes(stream)` (use `.buffer` for an `ArrayBuffer`) |
| `await getStreamAsArray(stream)`, `await toArray(stream)` (stream-to-array) | `await toArray(stream)` |
| `getStream(stream, { maxBuffer })` | `toText(stream, { maxBytes })` |
| `catch (error) { if (error instanceof MaxBufferError) ... }` | `if (error instanceof MaxBytesError) ...` |
| `stream.pipe(concat((data) => ...))`, `stream.pipe(new BufferListStream((err, data) => ...))` | `const data = await toBytes(stream)` |
| `concat({ encoding: 'string' }, cb)` | `await toText(stream)` |
| `concat({ encoding: 'objects' }, cb)` | `await toArray(stream)` |
| `await getRawBody(stream, { limit: '1mb', encoding: 'utf-8' })` | `await toText(stream, { maxBytes: 1_000_000 })` |
| `merge2(a, b, c)` | `concat(a, b, c)` |
| `merge2([a, b])`, `merge(a, b)` (merge-stream) | `merge(a, b)` |
| `merge2(a, [b, c])` | `concat(a, merge(b, c))` |
| `through2.obj((chunk, enc, cb) => cb(null, f(chunk)))` | `map(f)` |
| `through2.obj(function (chunk, enc, cb) { if (keep(chunk)) this.push(chunk); cb() })` | `filter(keep)` |
| `through2.obj(transformFn, flushFn)` with state in `this` | `transform(async function* (source) { ... })` with state in local variables and the flush after the loop |
| `Readable.from(iterable)` | `fromIterable(iterable)` |

Behavior that differs:

- `maxBytes` always counts bytes. get-stream's `maxBuffer` counts characters for `getStream` and elements for `getStreamAsArray`; `toArray` has no limit.
- Errors carry no `bufferedData`. A collector that fails has already cancelled its source and dropped what it read.
- Byte collectors accept only `Uint8Array` (including `Buffer`) and `string` chunks. get-stream also accepted `ArrayBuffer`, `DataView` and other typed arrays, and concat-stream accepted numbers.
- Arrays and other iterables are valid sources; get-stream rejected them.
- Errors in any source always propagate through `concat` and `merge`. merge2 needed `pipeError: true`.
- There is no `.add()` or `{ end: false }`: pass every source when calling `concat` or `merge`.
- `map` passes on `undefined` like any other value. through2 dropped it; use `filter` to drop chunks.
- A `transform` generator starts when the output is first read, not when the first chunk is written.
