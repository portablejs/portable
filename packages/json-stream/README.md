# @portable/json-stream

Streams JSON in and out: values selected by JSONPath from one large document, and JSON text written from a tree of promises and streams. Runs in browsers, Cloudflare Workers, Deno, Bun and Node 24+.

Replaces [JSONStream](https://www.npmjs.com/package/JSONStream), [stream-json](https://www.npmjs.com/package/stream-json), [json-stream-stringify](https://www.npmjs.com/package/json-stream-stringify) and [@worker-tools/json-stream](https://www.npmjs.com/package/@worker-tools/json-stream). For NDJSON, which ndjson and stream-json's `jsonl` modules handle, use [`@portable/ndjson`](../ndjson).

```sh
npm install @portable/json-stream
```

```ts
import * as JsonStream from '@portable/json-stream'

const response = await fetch('https://example.com/_all_docs')
const reader = response
  .body!.pipeThrough(new JsonStream.ParserStream({ paths: ['$.rows[*]'] }))
  .getReader()
for (let r = await reader.read(); !r.done; r = await reader.read()) console.log(r.value.value)
```

## `ParserStream`

A `TransformStream<Uint8Array | string, { path, value }>` that emits each value found at one of the given JSONPath expressions. Only matched values are built; the rest of the document is checked for syntax and dropped, so memory use depends on the size of a match, not of the document. `path` holds the keys and array indexes from the root to the value. The input may hold several top-level values separated by whitespace.

| Option | Default | Description |
| --- | --- | --- |
| `paths` | `['$']` | JSONPath expressions. Supported: `$`, `.name`, `['name']`, `[0]`, `.*`, `[*]` and `..` before any of them. A nested match is emitted before the value that contains it. |

The stream fails with `InvalidInputError` on malformed JSON and with `TruncatedError` when the input ends inside a value.

## `encode`

Returns a `ReadableStream<string>` with the JSON text of a value whose parts may still be loading. Promises are awaited, functions are called with no arguments, and `ReadableStream`s and async iterables are written as arrays. Output stops at each unresolved value until it is ready, so the reader gets the start of the document early. Cancelling the output cancels nested streams and calls `return()` on nested iterators.

```ts
const body = JsonStream.encode({ user: getUser(id), posts: db.posts.cursor() })
return new Response(body.pipeThrough(new TextEncoderStream()), {
  headers: { 'content-type': 'application/json' },
})
```

| Option | Default | Description |
| --- | --- | --- |
| `replacer` | none | As in `JSON.stringify`: a function or a list of keys. The function receives resolved values. |
| `space` | none | As in `JSON.stringify`. |

The text matches what `JSON.stringify` gives for the resolved tree. A circular structure or a `BigInt` fails the stream with a `TypeError`.

## Migrating

| Upstream | @portable/json-stream |
| --- | --- |
| `JSONStream.parse('rows.*')` | `new ParserStream({ paths: ['$.rows[*]'] })`, then read `.value` |
| `JSONStream.parse('rows..id')` | `new ParserStream({ paths: ['$.rows..id'] })` |
| `JSONStream.parse(['rows', true, 'doc'])` | `new ParserStream({ paths: ['$.rows[*].doc'] })` |
| `JSONStream.parse('rows.*', fn)` | Pipe through another `TransformStream`. |
| `JSONStream.stringify()` | `encode(stream)` |
| stream-json `parser()` + `pick({ filter: 'data' })` + `streamArray()` | `new ParserStream({ paths: ['$.data[*]'] })` |
| stream-json `withParser()` + `streamValues()` | `new ParserStream()` |
| `new JsonStreamStringify(value, replacer, spaces)` | `encode(value, { replacer, space })` |
| @worker-tools/json-stream `jsonStringifyStream` | `encode` |
| @worker-tools/json-stream `JSONParseStream('$.rows.*')` | `new ParserStream({ paths: ['$.rows[*]'] })` |

Deliberate differences:

- `null` matches are emitted. JSONStream drops them.
- A trailing comma fails the stream. JSONStream accepts it.
- `[*]` and `.*` select object members as well as array items.
- `encode` calls functions in the tree. `JSON.stringify` and json-stream-stringify drop them.
- `encode` has no `cycle` option. A circular structure fails, as in `JSON.stringify`.
- A `BigInt` fails, as in `JSON.stringify`.
