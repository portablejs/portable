# @portable/json-stream

Reads values by JSONPath from a large JSON stream, and writes JSON from a tree of promises and streams. Runs in browsers, Cloudflare Workers, Node 24+, Bun, and Deno.

Replaces [JSONStream](https://www.npmjs.com/package/JSONStream), [stream-json](https://www.npmjs.com/package/stream-json), [json-stream-stringify](https://www.npmjs.com/package/json-stream-stringify), and [@worker-tools/json-stream](https://www.npmjs.com/package/@worker-tools/json-stream). For NDJSON, use [@portable/jsonl](https://portablejs.com/packages/jsonl).

```sh
npm install @portable/json-stream
```

```ts
import * as JsonStream from '@portable/json-stream';
import * as Streams from '@portable/streams';

// {"total_rows":129,"rows":[{"id":"a"},{"id":"b"}]}
const response = await fetch('https://example.com/_all_docs');
const matches = response.body!.pipeThrough(new JsonStream.DecoderStream({ paths: ['$.rows[*]'] }));
// { path: ['rows', 0], value: { id: 'a' } }, ...
for await (const { value } of Streams.toAsyncIterable(matches)) {
  console.log(value);
}
```

## `DecoderStream`

A `TransformStream<Uint8Array | string, { path, value }>` that emits each value matching one of the JSONPath expressions. `path` holds the keys and array indexes from the root to the value.

Only matched values are built, so memory use depends on the size of a match, not the document. The input may hold several top-level values separated by whitespace, and `path` doesn't say which one a match came from.

| Option | Default | Description |
| --- | --- | --- |
| `paths` | `['$']` | JSONPath expressions using `$`, `.name`, `['name']`, `[0]`, `.*`, `[*]`, and `..` before any of them. Throws a `RangeError` for any other expression. A nested match is emitted before its parent. The default emits each top-level value whole, so pass a narrower path to keep memory low. |
| `maxLength` | `Infinity` | Longest matched value, in UTF-16 code units of its JSON text. A longer match fails the stream with `MaxLengthError` as soon as it passes the limit. Unmatched values don't count. |
| `signal` | none | Aborting errors the stream with `signal.reason` and cancels the source piped into it. |

The stream fails with `InvalidInputError` on malformed JSON, and with `TruncatedError` if the input ends inside a value. Empty input emits nothing.

## `encodeStream`

Returns a `ReadableStream<Uint8Array>` of UTF-8 JSON text for a value whose parts may still be loading. The output starts before the slow parts are ready.

Promises are awaited, functions are called with no arguments, and `ReadableStream`s and async iterables are written as arrays. Sync iterables, such as generators and `Set`, are not expanded, so convert them with `Array.from` first.

```ts
const body = JsonStream.encodeStream({ user: getUser(id), posts: db.posts.cursor() });
return new Response(body, { headers: { 'content-type': 'application/json' } });
```

| Option | Default | Description |
| --- | --- | --- |
| `replacer` | none | As in `JSON.stringify`: a function, which receives resolved values, or a list of keys. |
| `space` | none | As in `JSON.stringify`. |
| `signal` | none | Aborting errors the output with `signal.reason` and cancels nested streams and iterators. |

The text matches `JSON.stringify` of the resolved tree. The stream is empty if the root resolves to `undefined` or a symbol.

If a promise rejects, a function throws, or a nested stream errors, the output fails with that error. A circular structure or a `BigInt` fails it with a `TypeError`.

## Why use this over JSONStream, stream-json, and json-stream-stringify

Those libraries are Node streams. This package uses a `TransformStream` and a `ReadableStream`, so it runs in any runtime.

- `DecoderStream` selects the rows of a 3 MB document about 2.3× faster than JSONStream. JSONStream keeps the parents of every match and runs out of memory on large files (JSONStream #32, #101).
- `encodeStream` is as fast as json-stream-stringify on a 3 MB object, and about 1.3× faster on rows from an async iterable.
- Invalid JSON fails the stream. JSONStream ends quietly on `{"]` (JSONStream #145) and accepts a trailing comma. stream-json can miss invalid JSON or hang (stream-json #104).
- `null` matches are emitted. JSONStream drops them.
- `encodeStream` writes valid JSON where json-stream-stringify doesn't: a stream after the first property (#47), an empty key (#28), and a replacer that drops the last key (#7).
- `DecoderStream` emits `{ path, value }`, not the bare value as JSONStream's `parse` does. It has no map function, so pipe its output through another `TransformStream`.
- `encodeStream` calls functions in the tree and writes their return values. json-stream-stringify and `JSON.stringify` drop them.
- json-stream-stringify's `cycle` option has no equivalent.

<!-- bench:start -->
<table>
<thead><tr><th align="left">Library</th><th align="right">Ops/s</th><th align="left">Relative</th><th></th></tr></thead>
<tbody>
<tr><th colspan="4" align="left">Select the rows of a 3 MB document</th></tr>
<tr><td><code>JSON.parse</code> or <code>JSON.stringify</code></td><td align="right">55.8</td><td>2.6× faster</td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="160" height="12" alt="" /></td></tr>
<tr><td>@portable/json-stream</td><td align="right">21.1</td><td></td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="61" height="12" alt="" /></td></tr>
<tr><td>JSONStream</td><td align="right">9.02</td><td>2.3× slower</td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="26" height="12" alt="" /></td></tr>
<tr><td>stream-json</td><td align="right">1.94</td><td>11× slower</td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="6" height="12" alt="" /></td></tr>
<tr><td>stream-json, web streams</td><td align="right">0.816</td><td>26× slower</td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="2" height="12" alt="" /></td></tr>
<tr><th colspan="4" align="left">Encode a 3 MB object</th></tr>
<tr><td><code>JSON.parse</code> or <code>JSON.stringify</code></td><td align="right">124</td><td>5.6× faster</td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="160" height="12" alt="" /></td></tr>
<tr><td>json-stream-stringify</td><td align="right">22.2</td><td>same</td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="29" height="12" alt="" /></td></tr>
<tr><td>@portable/json-stream</td><td align="right">22.0</td><td></td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="28" height="12" alt="" /></td></tr>
<tr><th colspan="4" align="left">Encode rows from an async iterable</th></tr>
<tr><td>@portable/json-stream</td><td align="right">99.6</td><td></td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="160" height="12" alt="" /></td></tr>
<tr><td>json-stream-stringify</td><td align="right">79.5</td><td>1.3× slower</td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="128" height="12" alt="" /></td></tr>
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
