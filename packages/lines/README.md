# @portable/lines

Splits a stream of bytes or text into lines. Runs in browsers, Cloudflare Workers, Node 24+, Bun, and Deno.

Replaces [split2](https://www.npmjs.com/package/split2) and [byline](https://www.npmjs.com/package/byline).

```sh
npm install @portable/lines
```

```ts
import * as Lines from '@portable/lines';
import * as Streams from '@portable/streams';

const response = await fetch('https://example.com/access.log');
const lines = response.body!.pipeThrough(new Lines.DecoderStream());
for await (const line of Streams.toAsyncIterable(lines)) {
  console.log(line);
}
```

`Lines.DecoderStream` is a `TransformStream<Uint8Array | string, string>`. It emits each line without its separator. A separator at the end of the input doesn't add an empty line: `'a\nb\n'` gives `'a'` and `'b'`.

Byte chunks are decoded with `TextDecoder`, which replaces invalid bytes with U+FFFD and removes a leading byte order mark. A character or a CRLF split across chunks is read correctly.

## Options

| Option | Default | Description |
| --- | --- | --- |
| `separator` | `/\r?\n/` | A string, a `RegExp`, or any object with `[Symbol.split]`. The default splits at LF and CRLF, not at a lone CR. Any other `RegExp` or object re-splits the unfinished line on each chunk, so set `maxLength` if lines can be long. Don't use capturing groups, because `split` emits each group as a line. |
| `encoding` | `'utf-8'` | `TextDecoder` label for byte chunks. Throws a `RangeError` for an unknown label. |
| `maxLength` | `Infinity` | Longest allowed line, in UTF-16 code units, not counting the separator. Throws a `RangeError` if negative. |
| `overflow` | `'error'` | When a line exceeds `maxLength`, `'error'` fails the stream with `Lines.MaxLengthError`, and `'skip'` drops the line. |
| `skipEmpty` | `false` | Drop empty lines. |
| `signal` | none | Aborting errors the stream with `signal.reason` and cancels the source piped into it. |

## Types

| Type | Description |
| --- | --- |
| `Lines.Separator` | The `separator` option: a string to match, or anything with `[Symbol.split]`, such as a `RegExp`. |

## Why use this over split2 and byline

split2 and byline are Node `Transform` streams. `Lines.DecoderStream` is a `TransformStream`, so it works on a `fetch` response body in any runtime.

- It is as fast as split2 in Node. `node:readline` is about 2× faster, but runs only in Node.
- `maxLength` is checked on every line. split2 checks only the unfinished line at the end of each chunk, so it can miss a long line depending on how the input is chunked.
- Empty lines are kept by default, as in split2. byline drops them unless you pass `keepEmptyLines`.
- There is no mapper function like `split2(JSON.parse)`. Pipe the output through another `TransformStream` instead.
- byline splits on every Unicode line break. Pass `separator: /\r\n|[\n\v\f\r\x85\u2028\u2029]/` for the same result.

<!-- bench:start -->
<table>
<thead><tr><th align="left">Library</th><th align="right">Ops/s</th><th align="left">Relative</th><th></th></tr></thead>
<tbody>
<tr><th colspan="4" align="left">Split 1.7 MB into lines</th></tr>
<tr><td><code>node:readline</code></td><td align="right">165</td><td>2.0× faster</td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="160" height="12" alt="" /></td></tr>
<tr><td>split2</td><td align="right">84.6</td><td>same</td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="82" height="12" alt="" /></td></tr>
<tr><td>@portable/lines</td><td align="right">82.8</td><td></td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="80" height="12" alt="" /></td></tr>
<tr><td>byline</td><td align="right">40.7</td><td>2.0× slower</td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="39" height="12" alt="" /></td></tr>
</tbody>
</table>

Operations per second from `pnpm bench`, higher is better, in Node 24.22.0, on Intel(R) Xeon(R) Processor @ 2.10GHz (4 cores). Each benchmark lists only the libraries that can do the same work, fastest first. The relative speed compares each library with @portable/lines, and the bars are scaled to the fastest library.

| Library | Version | Minified and gzipped | Runtime dependencies | Node built-ins | TypeScript types |
| --- | --- | ---: | ---: | --- | --- |
| @portable/lines | – | 1.3 kB | 3 | none | included |
| split2 | 4.2.0 | 1.1 kB | 0 | `stream`, `string_decoder` | @types/split2 |
| byline | 5.0.0 | 1.2 kB | 0 | `Buffer`, `stream`, `timers`, `util` | @types/byline |
| `node:readline` | – | built in | – | Node only | – |

Sizes cover the imports in the usage example, or the equivalent imports of each library, bundled for the browser by `scripts/bundle-size.ts`. Runtime dependencies count every package installed with the published package. A library that uses Node built-ins needs polyfills in a browser and the `nodejs_compat` flag in Cloudflare Workers.
<!-- bench:end -->
