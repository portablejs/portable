# @portable/jsonl

Decodes and encodes JSON Lines (`.jsonl`, also called NDJSON or newline-delimited JSON) streams. Runs in browsers, Cloudflare Workers, Node 24+, Bun, and Deno.

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

`DecoderStream` is a `TransformStream<Uint8Array | string, unknown>` that parses each line with `JSON.parse`. Lines end in LF or CRLF, not a lone CR. Blank and whitespace-only lines are skipped.

Byte chunks are decoded as UTF-8, with invalid bytes replaced by U+FFFD and a leading byte order mark removed. For other encodings, decode to strings first.

`EncoderStream` is a `TransformStream<unknown, Uint8Array>` that writes each value as `JSON.stringify(value)` and `\n`, in UTF-8. A value `JSON.stringify` can't encode, such as `undefined`, a `BigInt`, or a circular structure, fails the stream with a `TypeError`. The output can be a `Response` body:

```ts
const body = Streams.fromIterable(rows)
  .pipeThrough(new Jsonl.EncoderStream());
return new Response(body, { headers: { 'content-type': 'application/x-ndjson' } });
```

## Options

`DecoderStream` takes `invalid`, `maxLength`, and `signal`. `EncoderStream` takes `signal`.

| Option | Default | Description |
| --- | --- | --- |
| `invalid` | `'error'` | For a line that isn't valid JSON, `'error'` fails the stream with `Jsonl.InvalidInputError`, whose message gives the 1-based line number. `'skip'` drops the line. |
| `maxLength` | `Infinity` | Longest line, in UTF-16 code units, not counting the line ending. A longer line, even a whitespace-only one, fails the stream with `Jsonl.MaxLengthError` as soon as it passes the limit. Throws a `RangeError` if negative. Set it for untrusted input. |
| `signal` | none | Aborting errors the stream with `signal.reason` and cancels the source piped into it. |

## Why use this over ndjson and stream-json

ndjson uses Node object streams. `DecoderStream` and `EncoderStream` are `TransformStream`s, so they read a `fetch` body and write a `Response` body in any runtime.

- Decoding is about 1.1× faster than ndjson, and encoding about 1.5× faster. stream-json encodes about 1.3× faster than `EncoderStream`.
- A `null` line is emitted as `null`. In ndjson it ends the stream (ndjson #6).
- Lines end in `\n`. ndjson uses `os.EOL`, which is `\r\n` on Windows.
- A circular value fails the stream. ndjson writes `"[Circular ~]"` instead.
- A whitespace-only line is skipped. ndjson reports it as invalid.
- stream-json's `jsonl/Parser` emits `{ key, value }` objects. `DecoderStream` emits the values.
- stream-json can replace a bad line or pass its raw text on. To do that here, split with `Lines.DecoderStream` from [@portable/lines](https://portablejs.com/packages/lines) and call `JSON.parse` yourself.

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
| ndjson | 2.0.0 | 13 kB | 9 | `buffer`, `events`, `os`, `string_decoder`, `util` | @types/ndjson |
| stream-json | 3.7.0 | 3.5 kB | 1 | `stream`, `string_decoder` | included |
| `JSON.parse` or `JSON.stringify` | – | built in | – | none | – |

Sizes cover the imports in the usage example, or the equivalent imports of each library, bundled for the browser by `scripts/bundle-size.ts`. Runtime dependencies count every package installed with the published package. A library that uses Node built-ins needs polyfills in a browser and the `nodejs_compat` flag in Cloudflare Workers.
<!-- bench:end -->
