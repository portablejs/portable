# @portable/json-stream

Streams JSON in and out: values selected by JSONPath from one large document, and JSON text written from a tree of promises and streams. Runs in browsers, Cloudflare Workers, Deno, Bun and Node 24+.

Replaces [JSONStream](https://www.npmjs.com/package/JSONStream), [stream-json](https://www.npmjs.com/package/stream-json), [json-stream-stringify](https://www.npmjs.com/package/json-stream-stringify) and [@worker-tools/json-stream](https://www.npmjs.com/package/@worker-tools/json-stream). For NDJSON, which ndjson and stream-json's `jsonl` modules handle, use `@portable/jsonl`.

```sh
npm install @portable/json-stream
```

```ts
import * as JsonStream from '@portable/json-stream';

const response = await fetch('https://example.com/_all_docs');
const matches = response.body!.pipeThrough(new JsonStream.DecoderStream({ paths: ['$.rows[*]'] }));
for await (const { value } of Streams.toAsyncIterable(matches)) {
  console.log(value);
}
```

## `DecoderStream`

A `TransformStream<Uint8Array | string, { path, value }>` that emits each value found at one of the given JSONPath expressions. Only matched values are built. The rest of the document is checked for syntax and dropped, so memory use depends on the size of a match, not of the document. `path` holds the keys and array indexes from the root to the value. The input may hold several top-level values separated by whitespace.

| Option | Default | Description |
| --- | --- | --- |
| `paths` | `['$']` | JSONPath expressions. Supported: `$`, `.name`, `['name']`, `[0]`, `.*`, `[*]` and `..` before any of them. Any other expression throws a `RangeError`. A nested match is emitted before the value that contains it. |
| `maxLength` | `Infinity` | Longest matched value, in UTF-16 code units of its JSON text. The stream buffers each matched value until the value ends, and fails with `MaxLengthError` as soon as a buffered value grows past the limit. Values outside `paths` are never buffered. |
| `signal` | none | Aborting errors the stream with `signal.reason` and cancels the source piped into it. |

The stream fails with `InvalidInputError` on malformed JSON, with `TruncatedError` when the input ends inside a value, and with `MaxLengthError` when a matched value is longer than `maxLength`. The `MaxLengthError` stores the limit in `maxLength`.

## `encodeStream`

Returns a `ReadableStream<Uint8Array>` with the UTF-8 JSON text of a value whose parts may still be loading. Promises are awaited, functions are called with no arguments, and `ReadableStream`s and async iterables are written as arrays. Output pauses at each unresolved value until the value is ready, so the reader gets the start of the document early. Cancelling the output cancels nested streams and calls `return()` on nested iterators.

```ts
const body = JsonStream.encodeStream({ user: getUser(id), posts: db.posts.cursor() });
return new Response(body, { headers: { 'content-type': 'application/json' } });
```

| Option | Default | Description |
| --- | --- | --- |
| `replacer` | none | As in `JSON.stringify`: a function or a list of keys. The function receives resolved values. |
| `space` | none | As in `JSON.stringify`. |
| `signal` | none | Aborting errors the output with `signal.reason` and cancels nested streams and iterators. |

The text matches what `JSON.stringify` gives for the resolved tree. A circular structure or a `BigInt` fails the stream with a `TypeError`.

## Why use this over JSONStream, stream-json and json-stream-stringify

Those libraries are Node streams. This package does the same jobs with a `TransformStream` and a `ReadableStream`, and has no dependencies outside `@portable/*`.

- `DecoderStream` selected the rows of a 3 MB document about 2.3× faster than JSONStream. It builds only the matched values, so memory use depends on the size of a match. JSONStream keeps the parents of every match and runs out of memory on large files (JSONStream #32, #101).
- `encodeStream` ran at the same speed as json-stream-stringify on a 3 MB object, and about 1.3× faster on rows from an async iterable.
- Invalid JSON fails the stream. JSONStream ends quietly on `{"]` (JSONStream #145) and accepts a trailing comma, and stream-json can miss invalid JSON or hang (stream-json #104).
- `null` matches are emitted. JSONStream drops them.
- `encodeStream` writes valid JSON in cases where json-stream-stringify doesn't: a stream that isn't the first property (#47), an empty key (#28), and a replacer that drops the last key (#7).
- JSONStream's `parse` emits each matched value, and `DecoderStream` emits `{ path, value }`, so read `.value`.
- JSONStream's `parse` takes a function that maps each match. `DecoderStream` has no such argument, so pipe its output through another `TransformStream`.
- json-stream-stringify and `JSON.stringify` drop functions in the tree, and `encodeStream` calls them and writes their return values.
- json-stream-stringify's `cycle` option has no equivalent.

<!-- bench:start -->
<table>
<thead><tr><th align="left">Library</th><th align="right">Ops/s</th><th align="left">Relative</th><th></th></tr></thead>
<tbody>
<tr><th colspan="4" align="left">Select the rows of a 3 MB document</th></tr>
<tr><td><code>JSON.parse</code> or <code>JSON.stringify</code></td><td align="right">55.8</td><td>2.6× faster</td><td><img src="https://portablejs.com/bar.svg" width="160" height="12" alt="" /></td></tr>
<tr><td>@portable/json-stream</td><td align="right">21.1</td><td></td><td><img src="https://portablejs.com/bar.svg" width="61" height="12" alt="" /></td></tr>
<tr><td>JSONStream</td><td align="right">9.02</td><td>2.3× slower</td><td><img src="https://portablejs.com/bar.svg" width="26" height="12" alt="" /></td></tr>
<tr><td>stream-json</td><td align="right">1.94</td><td>11× slower</td><td><img src="https://portablejs.com/bar.svg" width="6" height="12" alt="" /></td></tr>
<tr><td>stream-json, web streams</td><td align="right">0.816</td><td>26× slower</td><td><img src="https://portablejs.com/bar.svg" width="2" height="12" alt="" /></td></tr>
<tr><th colspan="4" align="left">Encode a 3 MB object</th></tr>
<tr><td><code>JSON.parse</code> or <code>JSON.stringify</code></td><td align="right">124</td><td>5.6× faster</td><td><img src="https://portablejs.com/bar.svg" width="160" height="12" alt="" /></td></tr>
<tr><td>json-stream-stringify</td><td align="right">22.2</td><td>same</td><td><img src="https://portablejs.com/bar.svg" width="29" height="12" alt="" /></td></tr>
<tr><td>@portable/json-stream</td><td align="right">22.0</td><td></td><td><img src="https://portablejs.com/bar.svg" width="28" height="12" alt="" /></td></tr>
<tr><th colspan="4" align="left">Encode rows from an async iterable</th></tr>
<tr><td>@portable/json-stream</td><td align="right">99.6</td><td></td><td><img src="https://portablejs.com/bar.svg" width="160" height="12" alt="" /></td></tr>
<tr><td>json-stream-stringify</td><td align="right">79.5</td><td>1.3× slower</td><td><img src="https://portablejs.com/bar.svg" width="128" height="12" alt="" /></td></tr>
</tbody>
</table>

Operations per second from `pnpm bench`, higher is better, in Node 24.22.0, on Intel(R) Xeon(R) Processor @ 2.10GHz (4 cores). Each benchmark lists only the libraries that can do the same work, fastest first. The relative speed compares each library with @portable/json-stream, and the bars are scaled to the fastest library.

| Library | Version | Minified and gzipped | Runtime dependencies | Node built-ins | TypeScript types |
| --- | --- | ---: | ---: | --- | --- |
| @portable/json-stream | – | 3.3 kB | 3 | none | included |
| JSONStream | 1.3.5 | 3.9 kB | 2 | `Buffer`, `stream` | none |
| stream-json | 3.7.0 | 10 kB | 1 | `stream`, `string_decoder` | included |
| stream-json, web streams | 3.7.0 | 9.0 kB | 1 | `string_decoder` | included |
| json-stream-stringify | 3.1.7 | 2.8 kB | 0 | `stream` | included |
| `JSON.parse` or `JSON.stringify` | – | built in | – | none | – |

Sizes cover the imports in the usage example, or the equivalent imports of each library, bundled for the browser by `scripts/bundle-size.ts`. Runtime dependencies count every package installed with the published package. A library that uses Node built-ins needs polyfills in a browser and the `nodejs_compat` flag in Cloudflare Workers.
<!-- bench:end -->
