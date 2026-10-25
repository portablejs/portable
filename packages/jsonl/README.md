# @portable/jsonl

Decodes and encodes JSON Lines (`.jsonl`, also called NDJSON or newline-delimited JSON) streams. Runs in browsers, Cloudflare Workers, Deno, Bun and Node 24+.

Replaces [ndjson](https://www.npmjs.com/package/ndjson) and the `jsonl` modules of [stream-json](https://www.npmjs.com/package/stream-json).

```sh
npm install @portable/jsonl
```

```ts
import * as Jsonl from '@portable/jsonl';
import * as Streams from '@portable/streams';

const response = await fetch('https://example.com/events.ndjson');
const events = response.body!.pipeThrough(new Jsonl.DecoderStream());
for await (const event of Streams.toAsyncIterable(events)) {
  console.log(event);
}
```

`DecoderStream` is a `TransformStream<Uint8Array | string, unknown>` that parses each line with `JSON.parse`. Lines may end in LF or CRLF, blank and whitespace-only lines are skipped, and a last line with no newline is decoded too. Byte chunks are decoded as UTF-8, so a multi-byte character split across chunks is decoded correctly.

`EncoderStream` is a `TransformStream<unknown, Uint8Array>` that writes each value as `JSON.stringify(value)` followed by `\n`, in UTF-8. A value that `JSON.stringify` can't encode (`undefined`, a function, a symbol, a `BigInt` or a circular structure) fails the stream with a `TypeError`. Its output can be a `Response` body as it is:

```ts
const body = Streams.fromIterable(rows)
  .pipeThrough(new Jsonl.EncoderStream());
return new Response(body, { headers: { 'content-type': 'application/x-ndjson' } });
```

## Options

`DecoderStream` takes `invalid`, `maxLength` and `signal`. `EncoderStream` takes `signal`.

| Option | Default | Description |
| --- | --- | --- |
| `invalid` | `'error'` | A line that isn't valid JSON: `'error'` fails the stream with `InvalidInputError`, whose message gives the line number, and `'skip'` drops the line. |
| `maxLength` | `Infinity` | Longest line, in UTF-16 code units, line ending excluded. As soon as a line grows past the limit, the stream fails with `Jsonl.MaxLengthError`, which stores the limit in `maxLength`. Set it when the input comes from outside the program. |
| `signal` | none | Aborting errors the stream with `signal.reason` and cancels the source piped into it. |

## Why use this over ndjson and stream-json

ndjson is a pair of Node object streams. `DecoderStream` and `EncoderStream` are `TransformStream`s, so they read a `fetch` body and write a `Response` body in any JavaScript runtime, and the package has no dependencies outside `@portable/*`.

- Decoding 20,000 rows ran about 1.1× faster than ndjson, and encoding them about 1.5× faster. stream-json's `jsonl/Stringer` encoded them about 1.3× faster than `EncoderStream`.
- A `null` line is emitted as `null`. In ndjson a `null` line ends the stream, because Node object streams treat `null` as the end (ndjson #6).
- `EncoderStream` ends every line with `\n`. ndjson uses `os.EOL`, so on Windows it writes `\r\n`.
- A circular value fails the stream with a `TypeError`. ndjson writes `"[Circular ~]"` in its place, which changes the data.
- A whitespace-only line is skipped, where ndjson reports it as invalid.
- stream-json's `jsonl/Parser` emits `{ key, value }` objects, and `DecoderStream` emits each value on its own.
- stream-json's `jsonl/Parser` can replace a bad line with another value or pass its raw text on, and `DecoderStream` can't. To do that, split with `Lines.DecoderStream` from `@portable/lines` and call `JSON.parse` yourself.

<!-- bench:start -->
<table>
<thead><tr><th align="left">Library</th><th align="right">Ops/s</th><th align="left">Relative</th><th></th></tr></thead>
<tbody>
<tr><th colspan="4" align="left">Decode 20,000 rows</th></tr>
<tr><td><code>JSON.parse</code> or <code>JSON.stringify</code></td><td align="right">44.5</td><td>1.2× faster</td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="160" height="12" alt="" /></td></tr>
<tr><td>@portable/jsonl</td><td align="right">38.6</td><td></td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="139" height="12" alt="" /></td></tr>
<tr><td>ndjson</td><td align="right">34.3</td><td>1.1× slower</td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="123" height="12" alt="" /></td></tr>
<tr><td>stream-json</td><td align="right">27.8</td><td>1.4× slower</td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="100" height="12" alt="" /></td></tr>
<tr><th colspan="4" align="left">Encode 20,000 rows</th></tr>
<tr><td><code>JSON.parse</code> or <code>JSON.stringify</code></td><td align="right">79.3</td><td>2.7× faster</td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="160" height="12" alt="" /></td></tr>
<tr><td>stream-json</td><td align="right">38.7</td><td>1.3× faster</td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="78" height="12" alt="" /></td></tr>
<tr><td>@portable/jsonl</td><td align="right">29.2</td><td></td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="59" height="12" alt="" /></td></tr>
<tr><td>ndjson</td><td align="right">19.0</td><td>1.5× slower</td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="38" height="12" alt="" /></td></tr>
</tbody>
</table>

Operations per second from `pnpm bench`, higher is better, in Node 24.22.0, on Intel(R) Xeon(R) Processor @ 2.10GHz (4 cores). Each benchmark lists only the libraries that can do the same work, fastest first. The relative speed compares each library with @portable/jsonl, and the bars are scaled to the fastest library.

| Library | Version | Minified and gzipped | Runtime dependencies | Node built-ins | TypeScript types |
| --- | --- | ---: | ---: | --- | --- |
| @portable/jsonl | – | 1.2 kB | 3 | none | included |
| ndjson | 2.0.0 | 13 kB | 9 | `buffer`, `events`, `os`, `string_decoder`, `util` | `@types/ndjson` |
| stream-json | 3.7.0 | 3.5 kB | 1 | `stream`, `string_decoder` | included |
| `JSON.parse` or `JSON.stringify` | – | built in | – | none | – |

Sizes cover the imports in the usage example, or the equivalent imports of each library, bundled for the browser by `scripts/bundle-size.ts`. Runtime dependencies count every package installed with the published package. A library that uses Node built-ins needs polyfills in a browser and the `nodejs_compat` flag in Cloudflare Workers.
<!-- bench:end -->
