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
for (let r = await reader.read(); !r.done; r = await reader.read()) {
  console.log(r.value)
}
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
| `signal` | none | Aborting errors the stream with `signal.reason` and cancels the source piped into it. |

## Types

| Type | Description |
| --- | --- |
| `Lines.Separator` | The `separator` option: a string to match, or anything with `[Symbol.split]`, such as a `RegExp`. |

## Why use this over split2 and byline

split2 and byline are Node `Transform` streams. `Lines.DecoderStream` is a `TransformStream`, so it splits a `fetch` response body in any JavaScript runtime, and it has no dependencies.

- It split 1.7 MB of text at the same speed as split2 in Node. `node:readline` was about 2× faster than both, but it exists only in Node.
- `maxLength` is checked on every line. split2 checks only the unfinished line at the end of each chunk, so whether it catches a long line depends on how the input was chunked.
- A multi-byte character or a CRLF split across two chunks is read as one character or one line break.
- Empty lines are kept by default, as in split2. byline drops them unless you pass `keepEmptyLines`, and `skipEmpty: true` drops them here.

<!-- bench:start -->
| | @portable/lines | split2 | byline | `node:readline` |
| --- | ---: | ---: | ---: | ---: |
| Split 1.7 MB into lines | 82.8 | 84.6 | 40.7 | 165 |

Operations per second from `pnpm bench`, higher is better, in Node 24.22.0, on Intel(R) Xeon(R) Processor @ 2.10GHz (4 cores). A dash means the library has no equivalent.

| | @portable/lines | split2 | byline | `node:readline` |
| --- | --- | --- | --- | --- |
| Minified and gzipped | 0.7 kB | 1.1 kB | 1.2 kB | built in |
| Runtime dependencies | 0 | 0 | 0 | – |
| Node built-ins used | none | `stream`, `string_decoder` | `Buffer`, `stream`, `timers`, `util` | Node only |
| TypeScript types | included | `@types/split2` | `@types/byline` | – |
| Version compared | – | 4.2.0 | 5.0.0 | – |

Sizes cover the imports in the usage example, or the equivalent imports of each library, bundled for the browser by `scripts/bundle-size.ts`. Runtime dependencies count every package installed with the published package. A library that uses Node built-ins needs polyfills in a browser and the `nodejs_compat` flag in Cloudflare Workers.
<!-- bench:end -->

## Migrating

From split2:

```diff
- import split2 from 'split2'
+ import * as Lines from '@portable/lines'

- stream.pipe(split2())
+ stream.pipeThrough(new Lines.DecoderStream())

- stream.pipe(split2('~'))
+ stream.pipeThrough(new Lines.DecoderStream({ separator: '~' }))

- stream.pipe(split2({ maxLength, skipOverflow: true }))
+ stream.pipeThrough(new Lines.DecoderStream({ maxLength, overflow: 'skip' }))

- stream.pipe(split2(JSON.parse))
+ stream
+   .pipeThrough(new Lines.DecoderStream())
+   .pipeThrough(
+     new TransformStream({
+       transform: (line, controller) => controller.enqueue(JSON.parse(line)),
+     }),
+   )
```

From byline:

```diff
- import byline from 'byline'
+ import * as Lines from '@portable/lines'

- byline(stream)
+ stream.pipeThrough(new Lines.DecoderStream({ skipEmpty: true }))

- byline(stream, { keepEmptyLines: true })
+ stream.pipeThrough(new Lines.DecoderStream())
```

Two behaviors differ from split2:

- `maxLength` applies to every line. split2 only checks the unfinished line at the end of each chunk, so whether a long line is caught depends on how the input was chunked.
- There is no mapper argument. Pipe through another `TransformStream` instead.

byline splits on every Unicode line break by default. Pass `separator: /\r\n|[\n\v\f\r\x85  ]/` for the same result.
