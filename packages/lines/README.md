# @portable/lines

Splits a stream of bytes or text into lines. Runs in browsers, Cloudflare Workers, Deno, Bun and Node 24+.

Replaces [split2](https://www.npmjs.com/package/split2) and [byline](https://www.npmjs.com/package/byline).

```sh
npm install @portable/lines
```

```ts
import { LineStream } from '@portable/lines'

const response = await fetch('https://example.com/access.log')
const reader = response.body!.pipeThrough(new LineStream()).getReader()
for (let r = await reader.read(); !r.done; r = await reader.read()) console.log(r.value)
```

`LineStream` is a `TransformStream<Uint8Array | string, string>`. Byte chunks are decoded with `TextDecoder`, so a multi-byte character split across chunks is decoded correctly, and a CRLF split across chunks counts as one line break.

## Options

| Option | Default | Description |
| --- | --- | --- |
| `separator` | `/\r?\n/` | A string, a `RegExp`, or any object with `[Symbol.split]`. |
| `encoding` | `'utf-8'` | `TextDecoder` label for byte chunks. |
| `maxLength` | `Infinity` | Longest allowed line, in UTF-16 code units. |
| `overflow` | `'error'` | When a line exceeds `maxLength`: `'error'` fails the stream with `OverflowError`, `'skip'` drops the line. |
| `skipEmpty` | `false` | Drop empty lines. |

## Migrating

| split2 / byline | @portable/lines |
| --- | --- |
| `stream.pipe(split2())` | `stream.pipeThrough(new LineStream())` |
| `split2('~')`, `split2(/~/)` | `new LineStream({ separator: '~' })` |
| `split2(JSON.parse)` | `.pipeThrough(new LineStream()).pipeThrough(new TransformStream({ transform: (line, c) => c.enqueue(JSON.parse(line)) }))` |
| `split2({ maxLength, skipOverflow: true })` | `new LineStream({ maxLength, overflow: 'skip' })` |
| `byline(stream)` | `stream.pipeThrough(new LineStream({ skipEmpty: true }))` |
| `byline(stream, { keepEmptyLines: true })` | `stream.pipeThrough(new LineStream())` |

Two behaviors differ from split2:

- `maxLength` applies to every line. split2 only checks the unfinished line at the end of each chunk, so whether a long line is caught depends on how the input was chunked.
- There is no mapper argument. Pipe through another `TransformStream` instead.

byline splits on every Unicode line break by default. Pass `separator: /\r\n|[\n\v\f\r\x85  ]/` for the same result.
