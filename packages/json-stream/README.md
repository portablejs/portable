# @portable/json-stream

Streams JSON in and out: values selected by JSONPath from one large document, and JSON text written from a tree of promises and streams. Runs in browsers, Cloudflare Workers, Deno, Bun and Node 24+.

Replaces [JSONStream](https://www.npmjs.com/package/JSONStream), [stream-json](https://www.npmjs.com/package/stream-json), [json-stream-stringify](https://www.npmjs.com/package/json-stream-stringify) and [@worker-tools/json-stream](https://www.npmjs.com/package/@worker-tools/json-stream). For NDJSON, which ndjson and stream-json's `jsonl` modules handle, use [`@portable/jsonl`](../ndjson).

```sh
npm install @portable/json-stream
```

```ts
import * as JsonStream from '@portable/json-stream'

const response = await fetch('https://example.com/_all_docs')
const reader = response
  .body!.pipeThrough(new JsonStream.DecoderStream({ paths: ['$.rows[*]'] }))
  .getReader()
for (let r = await reader.read(); !r.done; r = await reader.read()) console.log(r.value.value)
```

## `DecoderStream`

A `TransformStream<Uint8Array | string, { path, value }>` that emits each value found at one of the given JSONPath expressions. Only matched values are built; the rest of the document is checked for syntax and dropped, so memory use depends on the size of a match, not of the document. `path` holds the keys and array indexes from the root to the value. The input may hold several top-level values separated by whitespace.

| Option | Default | Description |
| --- | --- | --- |
| `paths` | `['$']` | JSONPath expressions. Supported: `$`, `.name`, `['name']`, `[0]`, `.*`, `[*]` and `..` before any of them. A nested match is emitted before the value that contains it. |
| `signal` | none | Aborting errors the stream with `signal.reason` and cancels the source piped into it. |

The stream fails with `InvalidInputError` on malformed JSON and with `TruncatedError` when the input ends inside a value.

## `encodeStream`

Returns a `ReadableStream<string>` with the JSON text of a value whose parts may still be loading. Promises are awaited, functions are called with no arguments, and `ReadableStream`s and async iterables are written as arrays. Output stops at each unresolved value until it is ready, so the reader gets the start of the document early. Cancelling the output cancels nested streams and calls `return()` on nested iterators.

```ts
const body = JsonStream.encodeStream({ user: getUser(id), posts: db.posts.cursor() })
return new Response(body.pipeThrough(new TextEncoderStream()), {
  headers: { 'content-type': 'application/json' },
})
```

| Option | Default | Description |
| --- | --- | --- |
| `replacer` | none | As in `JSON.stringify`: a function or a list of keys. The function receives resolved values. |
| `space` | none | As in `JSON.stringify`. |
| `signal` | none | Aborting errors the output with `signal.reason` and cancels nested streams and iterators. |

The text matches what `JSON.stringify` gives for the resolved tree. A circular structure or a `BigInt` fails the stream with a `TypeError`.

## Why use this over JSONStream, stream-json and json-stream-stringify

Those libraries are Node streams. This package does the same jobs with a `TransformStream` and a `ReadableStream`, and has no dependencies.

- `DecoderStream` selected the rows of a 3 MB document about 2.3× faster than JSONStream. It builds only the matched values, so memory use depends on the size of a match. JSONStream keeps the parents of every match and runs out of memory on large files (JSONStream #32, #101).
- `encodeStream` ran at the same speed as json-stream-stringify on a 3 MB object, and about 1.2× faster on rows from an async iterable.
- Invalid JSON fails the stream. JSONStream ends quietly on `{"]` (JSONStream #145) and accepts a trailing comma, and stream-json can miss invalid JSON or hang (stream-json #104).
- `null` matches are emitted. JSONStream drops them.
- `encodeStream` writes valid JSON in cases where json-stream-stringify doesn't: a stream that isn't the first property (#47), an empty key (#28), and a replacer that drops the last key (#7).

<!-- size:start -->
Bundled for the browser, minified and gzipped, `@portable/json-stream` is 3.9 kB, against 3.9 kB (Node only) for JSONStream and 2.9 kB (Node only) for json-stream-stringify. "Node only" marks a library that imports Node builtins or uses `Buffer`, so it needs polyfills in a browser.
<!-- size:end -->

## Migrating

| Upstream | @portable/json-stream |
| --- | --- |
| `JSONStream.parse('rows.*')` | `new DecoderStream({ paths: ['$.rows[*]'] })`, then read `.value` |
| `JSONStream.parse('rows..id')` | `new DecoderStream({ paths: ['$.rows..id'] })` |
| `JSONStream.parse(['rows', true, 'doc'])` | `new DecoderStream({ paths: ['$.rows[*].doc'] })` |
| `JSONStream.parse('rows.*', fn)` | Pipe through another `TransformStream`. |
| `JSONStream.stringify()` | `encodeStream(stream)` |
| stream-json `parser()` + `pick({ filter: 'data' })` + `streamArray()` | `new DecoderStream({ paths: ['$.data[*]'] })` |
| stream-json `withParser()` + `streamValues()` | `new DecoderStream()` |
| `new JsonStreamStringify(value, replacer, spaces)` | `encodeStream(value, { replacer, space })` |
| @worker-tools/json-stream `jsonStringifyStream` | `encodeStream` |
| @worker-tools/json-stream `JSONParseStream('$.rows.*')` | `new DecoderStream({ paths: ['$.rows[*]'] })` |

Deliberate differences:

- `null` matches are emitted. JSONStream drops them.
- A trailing comma fails the stream. JSONStream accepts it.
- `[*]` and `.*` select object members as well as array items.
- `encodeStream` calls functions in the tree. `JSON.stringify` and json-stream-stringify drop them.
- `encodeStream` has no `cycle` option. A circular structure fails, as in `JSON.stringify`.
- A `BigInt` fails, as in `JSON.stringify`.
