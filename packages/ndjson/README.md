# @portable/ndjson

Decodes and encodes NDJSON (newline-delimited JSON, also called JSON Lines) streams. Runs in browsers, Cloudflare Workers, Deno, Bun and Node 24+.

Replaces [ndjson](https://www.npmjs.com/package/ndjson) and the `jsonl` modules of [stream-json](https://www.npmjs.com/package/stream-json).

```sh
npm install @portable/ndjson
```

```ts
import * as Ndjson from '@portable/ndjson'

const response = await fetch('https://example.com/events.ndjson')
const reader = response.body!.pipeThrough(new Ndjson.DecoderStream()).getReader()
for (let r = await reader.read(); !r.done; r = await reader.read()) console.log(r.value)
```

`DecoderStream` is a `TransformStream<Uint8Array | string, unknown>` that parses each line with `JSON.parse`. Lines may end in LF or CRLF, blank and whitespace-only lines are skipped, and a last line with no newline is decoded too. Byte chunks are decoded as UTF-8, so a multi-byte character split across chunks is decoded correctly.

`EncoderStream` is a `TransformStream<unknown, string>` that writes each value as `JSON.stringify(value)` followed by `\n`. A value that `JSON.stringify` can't encode (`undefined`, a function, a symbol, a `BigInt` or a circular structure) fails the stream with a `TypeError`. Pipe it through `TextEncoderStream` for bytes:

```ts
const body = Streams.fromIterable(rows)
  .pipeThrough(new Ndjson.EncoderStream())
  .pipeThrough(new TextEncoderStream())
return new Response(body, { headers: { 'content-type': 'application/x-ndjson' } })
```

## Options

`DecoderStream` takes one option. `EncoderStream` takes none.

| Option | Default | Description |
| --- | --- | --- |
| `invalid` | `'error'` | A line that isn't valid JSON: `'error'` fails the stream with `InvalidInputError`, whose message gives the line number; `'skip'` drops the line. |

## Migrating

| ndjson / stream-json | @portable/ndjson |
| --- | --- |
| `stream.pipe(ndjson.parse())` | `stream.pipeThrough(new Ndjson.DecoderStream())` |
| `ndjson.parse({ strict: false })` | `new Ndjson.DecoderStream({ invalid: 'skip' })` |
| `ndjson.stringify()` | `new Ndjson.EncoderStream()` |
| stream-json `jsonl/Parser` | `new Ndjson.DecoderStream()`, which emits each value instead of `{ key, value }` |
| stream-json `jsonl/Parser({ ignoreErrors: true })` | `new Ndjson.DecoderStream({ invalid: 'skip' })` |
| stream-json `jsonl/Stringer` | `new Ndjson.EncoderStream()` |

Deliberate differences from ndjson:

- A `null` line is emitted as `null`. In ndjson's Node object stream it ends the stream.
- A whitespace-only line is skipped. ndjson reports it as invalid.
- `EncoderStream` always ends lines with `\n`. ndjson uses `os.EOL`, which is `\r\n` on Windows.
- A circular structure fails the stream. ndjson writes `"[Circular ~]"` in its place.

stream-json's `jsonl/Parser` can also replace a bad line with another value or pass its raw text on. To do that, split with `LineStream` from `@portable/lines` and call `JSON.parse` yourself.
