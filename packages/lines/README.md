# @portable/lines

Splits a stream of bytes or text into lines. Runs in browsers, Cloudflare Workers, Deno, Bun and Node 24+.

Replaces [split2](https://www.npmjs.com/package/split2) and [byline](https://www.npmjs.com/package/byline).

```sh
npm install @portable/lines
```

```ts
import * as Lines from '@portable/lines'

const response = await fetch('https://example.com/access.log')
const reader = response.body!.pipeThrough(new Lines.DecoderStream()).getReader()
for (let r = await reader.read(); !r.done; r = await reader.read()) console.log(r.value)
```

`Lines.DecoderStream` is a `TransformStream<Uint8Array | string, string>`. Byte chunks are decoded with `TextDecoder`, so a multi-byte character split across chunks is decoded correctly, and a CRLF split across chunks counts as one line break.

## Options

| Option | Default | Description |
| --- | --- | --- |
| `separator` | `/\r?\n/` | A string, a `RegExp`, or any object with `[Symbol.split]`. |
| `encoding` | `'utf-8'` | `TextDecoder` label for byte chunks. |
| `maxLength` | `Infinity` | Longest allowed line, in UTF-16 code units. |
| `overflow` | `'error'` | When a line exceeds `maxLength`: `'error'` fails the stream with `MaxLengthError`, `'skip'` drops the line. |
| `skipEmpty` | `false` | Drop empty lines. |

## Why use this over split2 and byline

split2 and byline are Node `Transform` streams. `Lines.DecoderStream` is a `TransformStream`, so it splits a `fetch` response body in any JavaScript runtime, and it has no dependencies.

- It split 1.7 MB of text at the same speed as split2 in Node. `node:readline` was about 2× faster than both, but it exists only in Node.
- `maxLength` is checked on every line. split2 checks only the unfinished line at the end of each chunk, so whether it catches a long line depends on how the input was chunked.
- A multi-byte character or a CRLF split across two chunks is read as one character or one line break.
- Empty lines are kept by default, as in split2. byline drops them unless you pass `keepEmptyLines`, and here `skipEmpty: true` does the same.

<!-- size:start -->
Bundled for the browser, minified and gzipped, `@portable/lines` is 0.6 kB, against 1.1 kB (Node only) for split2. "Node only" marks a library that imports Node builtins or uses `Buffer`, so it needs polyfills in a browser.
<!-- size:end -->

## Migrating

| split2 / byline | @portable/lines |
| --- | --- |
| `stream.pipe(split2())` | `stream.pipeThrough(new Lines.DecoderStream())` |
| `split2('~')`, `split2(/~/)` | `new Lines.DecoderStream({ separator: '~' })` |
| `split2(JSON.parse)` | `.pipeThrough(new Lines.DecoderStream()).pipeThrough(new TransformStream({ transform: (line, c) => c.enqueue(JSON.parse(line)) }))` |
| `split2({ maxLength, skipOverflow: true })` | `new Lines.DecoderStream({ maxLength, overflow: 'skip' })` |
| `byline(stream)` | `stream.pipeThrough(new Lines.DecoderStream({ skipEmpty: true }))` |
| `byline(stream, { keepEmptyLines: true })` | `stream.pipeThrough(new Lines.DecoderStream())` |

Two behaviors differ from split2:

- `maxLength` applies to every line. split2 only checks the unfinished line at the end of each chunk, so whether a long line is caught depends on how the input was chunked.
- There is no mapper argument. Pipe through another `TransformStream` instead.

byline splits on every Unicode line break by default. Pass `separator: /\r\n|[\n\v\f\r\x85  ]/` for the same result.
