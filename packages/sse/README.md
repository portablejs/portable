# @portable/sse

Reads, writes and reconnects server-sent event streams (`text/event-stream`). Runs in browsers, Cloudflare Workers, Deno, Bun and Node 24+.

Replaces [eventsource-parser](https://www.npmjs.com/package/eventsource-parser), the [eventsource](https://www.npmjs.com/package/eventsource) polyfill, [@microsoft/fetch-event-source](https://www.npmjs.com/package/@microsoft/fetch-event-source), and the event writers in [better-sse](https://www.npmjs.com/package/better-sse) and [hono's `streamSSE`](https://hono.dev/docs/helpers/streaming#streamsse).

```sh
npm install @portable/sse
```

Read events from any response, such as a streaming LLM API:

```ts
import * as Sse from '@portable/sse'

const response = await fetch('https://api.example.com/v1/chat', { method: 'POST', headers, body })
const reader = response.body!.pipeThrough(new Sse.DecoderStream()).getReader()
for (let r = await reader.read(); !r.done; r = await reader.read()) console.log(r.value.data)
```

Keep a stream open the way `EventSource` does, with your own method, headers and body:

```ts
const events = Sse.connect(new Request('https://example.com/feed', { headers: { authorization } }), {
  signal: controller.signal,
})
```

Write events from a server:

```ts
const body = messages.pipeThrough(new Sse.EncoderStream())
return new Response(body, { headers: { 'content-type': 'text/event-stream' } })
```

## API

### `Sse.Event`

What the decoder and `connect` produce, with the same values `EventSource` gives a `MessageEvent`:

| Field | Type | Value |
| --- | --- | --- |
| `event` | `string` | The block's `event` field, or `'message'`. |
| `data` | `string` | The block's `data` fields joined with `\n`. |
| `id` | `string \| undefined` | The last event ID. It keeps the last `id` field's value until another `id` field changes it, and is `undefined` until the stream sends one. |
| `retry` | `number \| undefined` | A reconnection time from a `retry` field that arrived since the previous event. |

A block without a `data` field is not an event, but its `id` and `retry` still apply.

### `new Sse.DecoderStream(options)` and `Sse.decode(input, options)`

`DecoderStream` is a `TransformStream<Uint8Array | string, Sse.Event>`. `decode` reads a complete body, as a string or bytes, into an array. Both follow the [WHATWG event stream rules](https://html.spec.whatwg.org/multipage/server-sent-events.html#event-stream-interpretation): bytes are UTF-8, one leading BOM is skipped, CR, LF and CRLF all end a line, comments and unknown fields are ignored, an `id` containing NUL is ignored, `retry` is read only when it is all ASCII digits, and an event without its closing blank line is dropped when the input ends.

| Option | Default | Description |
| --- | --- | --- |
| `maxLength` | `Infinity` | Longest line, and longest `data` of one event, in UTF-16 code units. A longer one throws `Sse.MaxLengthError`, which stores `maxLength`. |
| `signal` | | `DecoderStream` only. Fails the stream with `signal.reason` and cancels its source. |

### `new Sse.EncoderStream(options)` and `Sse.encode(message)`

`EncoderStream` is a `TransformStream<Sse.Message, Uint8Array>`. `encode` returns one message as a string. A message has optional `event`, `data`, `id`, `retry` and `comment` fields, so a decoded `Sse.Event` can be written back.

- Fields are written in the order `event`, `data`, `id`, `retry`, followed by the blank line that dispatches the event. A comment comes first and has no blank line, so `{ comment: '' }` is a keep-alive.
- `data` is split on CR, LF and CRLF into `data` lines, so it arrives unchanged.
- A CR or LF in `event` or `id`, a NUL in `id`, or a `retry` that is not a non-negative integer throws `Sse.InvalidInputError`.
- `EncoderStream` takes a `signal` option, as `DecoderStream` does.

### `Sse.connect(request, options)`

Sends `request` (a `Request`, URL or string) with `fetch` and returns a `ReadableStream<Sse.Event>` that reconnects like `EventSource`:

- It adds `Accept: text/event-stream` unless the request has an `Accept` header.
- A response other than 200, or one whose content type is not `text/event-stream`, fails the stream with `Sse.ResponseError`. The error's `response` is left unread so you can read the error body. A 204 closes the stream.
- When a response ends or fails, it waits and sends the request again with `Last-Event-ID` set to the last event ID. An empty `id` field removes the header. Events continue in the same stream.
- Cancelling the stream, or aborting `signal` or the request's own signal, aborts the request in flight and any wait.

Each attempt sends a clone of `request`, so a POST body is sent again on every reconnect. `connect` clones the request once when you call it, which leaves yours unread, and throws a `TypeError` if its body was already read. A `ReadableStream` body works too: the clone keeps a copy of it in memory for as long as the stream runs. Of the browsers, only Chrome can send a `ReadableStream` body, and only over HTTP/2 or HTTP/3. Firefox and Safari send the text `[object ReadableStream]` instead, so collect the stream first there with `body: await Streams.toBytes(stream)` from `@portable/streams`.

| Option | Default | Description |
| --- | --- | --- |
| `delay` | `{ initial: 1000, max: 30_000 }` | Wait before each reconnect: milliseconds, exponential backoff `{ initial, max, factor?, jitter? }` (full jitter by default), or `({ attempt, error }) => ms`. `attempt` counts reconnects since the last accepted response. A `retry` field from the server replaces it. It is `Timers.Delay` from `@portable/timers`, and an invalid one throws a `RangeError`. |
| `fetch` | `globalThis.fetch` | Sends each `Request`. A wrapper can change the request first, such as setting a fresh token. |
| `maxLength` | `Infinity` | As in `DecoderStream`. |
| `reconnectIf` | see below | `(error, { attempt }) => boolean \| Promise<boolean>`, called after each connection ends. `error` is `undefined` when the response ended normally. Return `false` to close the stream, or to fail it with `error`. |
| `signal` | | Fails the stream with `signal.reason`. |

By default `connect` reconnects after every error except `ResponseError` and `MaxLengthError`, and after a response that ends normally. For a request you don't want repeated, such as an LLM completion, pass `reconnectIf: () => false`. To also retry a 5xx response:

```ts
Sse.connect(request, {
  reconnectIf: (error) => !(error instanceof Sse.ResponseError) || error.response.status >= 500,
})
```

## Types

| Type | Description |
| --- | --- |
| `Sse.Event` | An event read from a stream, as `EventSource` would dispatch it. |
| `Sse.Message` | A message to write to an event stream. Every field is optional, and an `Sse.Event` fits. |

## Why use this over eventsource-parser, eventsource and fetch-event-source

eventsource-parser only reads. The `eventsource` polyfill and fetch-event-source only connect, through callbacks, and neither returns a stream you can pipe or cancel. better-sse and hono only write. This package does all three with web streams and no dependencies.

- On Node 24, `DecoderStream` decoded bytes faster than `TextDecoderStream` piped into eventsource-parser's `EventSourceParserStream`: 1.4× on one LLM token event per chunk, 1.7× on 2 to 16 byte chunks, 1.6× on a 1 MB line in 128-byte chunks, and at the same speed on 16 KB chunks. `connect` read a mocked response 1.5× faster than `fetch` with the same pair. `decode` on one complete string is the exception: it ran at 0.67 to 0.74× the speed of eventsource-parser's `createParser().feed` on short events, and at the same speed on the 1 MB line. See `test/*.bench.ts`.
- Events carry the values `EventSource` gives: `event` defaults to `'message'`, and `id` is the last event ID, so an `id` from a block without data isn't lost. eventsource-parser reports `id` only on the block that set it.
- fetch-event-source dispatches a block without `data` as an empty message, accepts `text/event-streaming` as a content type, retries an HTTP error forever, and uses `window` and `document`, so it fails in Workers and Node. It also ignores a signal that is already aborted.
- The `eventsource` polyfill can't send a body without a custom `fetch`. Its issue #326 reports events lost on mixed CRLF and LF line breaks, which `test/DecoderStream.conformance.ts` covers.
- better-sse writes multi-line `data` as one `data:` line, so every line after the first is lost, and strips trailing line breaks.
- `maxLength` gives the same result however the input is chunked.

`test/PARITY.md` maps every upstream test to ours and lists the upstream bugs this package handles differently.

<!-- bench:start -->
| | @portable/sse | eventsource-parser | eventsource | Hand-written with web APIs |
| --- | ---: | ---: | ---: | ---: |
| Decode 2,000 LLM token events, one per chunk | 365 | 252 | – | 280 |
| Decode named events in 16 KB chunks | 1,370 | 1,380 | – | 794 |
| Decode events in 2 to 16 byte chunks | 560 | 332 | – | 500 |
| Decode a 1 MB data line in 128-byte chunks | 81.3 | 52.4 | – | – |
| Decode 2,000 LLM token events from one string | 5,120 | 8,300 | – | – |
| Encode LLM token events | 12,100 | – | – | 5,400 |
| Encode LLM token events through `EncoderStream` | 235 | – | – | 201 |
| Connect and read 2,000 events | 346 | 225 | 189 | – |

Operations per second from `pnpm bench`, higher is better, in Node 24.22.0, on Intel(R) Xeon(R) Processor @ 2.10GHz (4 cores). A dash means the library has no equivalent.

| | @portable/sse | eventsource-parser | eventsource | Hand-written with web APIs |
| --- | --- | --- | --- | --- |
| Minified and gzipped | 1.2 kB | 1.9 kB | 3.6 kB | built in |
| Runtime dependencies | 0 | 0 | 1 | – |
| Node built-ins used | none | none | none | none |
| TypeScript types | included | included | included | – |
| Version compared | – | 4.1.2 | 5.1.3 | – |

Sizes cover the imports in the usage example, or the equivalent imports of each library, bundled for the browser by `scripts/bundle-size.ts`. Runtime dependencies count every package installed with the published package. A library that uses Node built-ins needs polyfills in a browser and the `nodejs_compat` flag in Cloudflare Workers.
<!-- bench:end -->

## Migrating

| Before | @portable/sse |
| --- | --- |
| `body.pipeThrough(new TextDecoderStream()).pipeThrough(new EventSourceParserStream())` | `body.pipeThrough(new Sse.DecoderStream())` |
| `createParser({ onEvent }).feed(text)` | `Sse.decode(text).forEach(onEvent)`, or `DecoderStream` for a stream |
| `event.event ?? 'message'` | `event.event` |
| `onId(id)` | `event.id` on every later event |
| `onRetry(ms)` | `event.retry` on the next event |
| `onComment`, `onError` | Not available. Comments and invalid lines are ignored, as `EventSource` does. |
| `maxBufferSize` | `maxLength` |
| `new EventSource(url)` from `eventsource` | `Sse.connect(url)` |
| `new EventSource(url, { fetch: (u, init) => fetch(u, { ...init, headers }) })` | `Sse.connect(new Request(url, { headers }))` |
| `es.close()` | `controller.abort()` with `signal`, or `reader.cancel()` |
| `es.addEventListener('update', fn)` | Read the stream and check `event.event === 'update'`. |
| `fetchEventSource(url, { method, headers, body, onmessage, signal })` | `Sse.connect(new Request(url, { method, headers, body }), { signal, reconnectIf: () => false })` |
| fetch-event-source `onopen(response)` | `fetch: async (request) => { const response = await fetch(request); check(response); return response }` |
| fetch-event-source `onerror(err)` returning an interval or throwing | `delay: ({ attempt, error }) => ms` and `reconnectIf` |
| better-sse `session.push(data, event, id)` | `writer.write({ data: JSON.stringify(data), event, id })` into an `EncoderStream` |
| better-sse keep-alive | `writer.write({ comment: '' })` on an interval |
| hono `stream.writeSSE({ data, event, id, retry })` | `writer.write({ data, event, id, retry })` into an `EncoderStream` |

Differences to know about:

- An event without its closing blank line is dropped at the end of a stream, as `EventSource` does. Some servers omit the last blank line, and their last event is lost in both.
- `connect` reconnects after a response that ends normally, like `EventSource`. fetch-event-source stops there instead. Pass `reconnectIf: () => false` for the same.
- `connect` doesn't close the stream while a browser tab is hidden, unlike fetch-event-source's default.
- `connect` doesn't set `cache: 'no-store'`, because Cloudflare Workers needs a compatibility flag for it. Set `cache` on the `Request` if you need it.
- `data` is a string. Call `JSON.stringify` before writing, where better-sse does it for you.
