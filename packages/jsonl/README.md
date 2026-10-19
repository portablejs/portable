# @portable/jsonl

Decodes and encodes JSON Lines (`.jsonl`, also called NDJSON or newline-delimited JSON) streams. Runs in browsers, Cloudflare Workers, Deno, Bun and Node 24+.

Replaces [ndjson](https://www.npmjs.com/package/ndjson) and the `jsonl` modules of [stream-json](https://www.npmjs.com/package/stream-json).

```sh
npm install @portable/jsonl
```

```ts
import * as Jsonl from '@portable/jsonl'

const response = await fetch('https://example.com/events.ndjson')
const reader = response.body!.pipeThrough(new Jsonl.DecoderStream()).getReader()
for (let r = await reader.read(); !r.done; r = await reader.read()) console.log(r.value)
```

`DecoderStream` is a `TransformStream<Uint8Array | string, unknown>` that parses each line with `JSON.parse`. Lines may end in LF or CRLF, blank and whitespace-only lines are skipped, and a last line with no newline is decoded too. Byte chunks are decoded as UTF-8, so a multi-byte character split across chunks is decoded correctly.

`EncoderStream` is a `TransformStream<unknown, string>` that writes each value as `JSON.stringify(value)` followed by `\n`. A value that `JSON.stringify` can't encode (`undefined`, a function, a symbol, a `BigInt` or a circular structure) fails the stream with a `TypeError`. Pipe it through `TextEncoderStream` for bytes:

```ts
const body = Streams.fromIterable(rows)
  .pipeThrough(new Jsonl.EncoderStream())
  .pipeThrough(new TextEncoderStream())
return new Response(body, { headers: { 'content-type': 'application/x-ndjson' } })
```

## Options

`DecoderStream` takes `invalid` and `signal`. `EncoderStream` takes `signal`.

| Option | Default | Description |
| --- | --- | --- |
| `invalid` | `'error'` | A line that isn't valid JSON: `'error'` fails the stream with `InvalidInputError`, whose message gives the line number, and `'skip'` drops the line. |
| `signal` | none | Aborting errors the stream with `signal.reason` and cancels the source piped into it. |

## Why use this over ndjson

ndjson is a pair of Node object streams. `DecoderStream` and `EncoderStream` are `TransformStream`s, so they read a `fetch` body and write a `Response` body in any JavaScript runtime, and the package has no dependencies.

- Decoding 20,000 rows ran at the same speed as ndjson, and encoding them was about 1.5× faster.
- A `null` line is emitted as `null`. In ndjson a `null` line ends the stream, because Node object streams treat `null` as the end (ndjson #6).
- `EncoderStream` ends every line with `\n`. ndjson uses `os.EOL`, so on Windows it writes `\r\n`.
- A circular value fails the stream with a `TypeError`. ndjson writes `"[Circular ~]"` in its place, which changes the data.
- A whitespace-only line is skipped, where ndjson reports it as invalid.

<!-- bench:start -->
| | @portable/jsonl | ndjson | stream-json | `JSON.parse` or `JSON.stringify` |
| --- | ---: | ---: | ---: | ---: |
| Decode 20,000 rows | 38.6 | 34.3 | 27.8 | 44.5 |
| Encode 20,000 rows | 29.2 | 19.0 | 38.7 | 79.3 |

Operations per second from `pnpm bench`, higher is better, in Node 24.22.0, on Intel(R) Xeon(R) Processor @ 2.10GHz (4 cores). A dash means the library has no equivalent.

| | @portable/jsonl | ndjson | stream-json | `JSON.parse` or `JSON.stringify` |
| --- | --- | --- | --- | --- |
| Minified and gzipped | 0.5 kB | 13 kB | 3.5 kB | built in |
| Runtime dependencies | 0 | 9 | 1 | – |
| Node built-ins used | none | `buffer`, `events`, `os`, `string_decoder`, `util` | `stream`, `string_decoder` | none |
| TypeScript types | included | `@types/ndjson` | included | – |
| Version compared | – | 2.0.0 | 3.7.0 | – |

Sizes cover the imports in the usage example, or the equivalent imports of each library, bundled for the browser by `scripts/bundle-size.ts`. Runtime dependencies count every package installed with the published package. A library that uses Node built-ins needs polyfills in a browser and the `nodejs_compat` flag in Cloudflare Workers.
<!-- bench:end -->

## Migrating

| ndjson / stream-json | @portable/jsonl |
| --- | --- |
| `stream.pipe(ndjson.parse())` | `stream.pipeThrough(new Jsonl.DecoderStream())` |
| `ndjson.parse({ strict: false })` | `new Jsonl.DecoderStream({ invalid: 'skip' })` |
| `ndjson.stringify()` | `new Jsonl.EncoderStream()` |
| stream-json `jsonl/Parser` | `new Jsonl.DecoderStream()`, which emits each value instead of `{ key, value }` |
| stream-json `jsonl/Parser({ ignoreErrors: true })` | `new Jsonl.DecoderStream({ invalid: 'skip' })` |
| stream-json `jsonl/Stringer` | `new Jsonl.EncoderStream()` |

Deliberate differences from ndjson:

- A `null` line is emitted as `null`. In ndjson's Node object stream it ends the stream.
- A whitespace-only line is skipped. ndjson reports it as invalid.
- `EncoderStream` always ends lines with `\n`. ndjson uses `os.EOL`, which is `\r\n` on Windows.
- A circular structure fails the stream. ndjson writes `"[Circular ~]"` in its place.

stream-json's `jsonl/Parser` can also replace a bad line with another value or pass its raw text on. To do that, split with `Lines.DecoderStream` from `@portable/lines` and call `JSON.parse` yourself.
