# @portable/sse

Reads, writes and reconnects server-sent event streams (`text/event-stream`). Runs in browsers, Cloudflare Workers, Node 24+, Bun, and Deno.

Replaces [eventsource-parser](https://www.npmjs.com/package/eventsource-parser), the [eventsource](https://www.npmjs.com/package/eventsource) polyfill, [@microsoft/fetch-event-source](https://www.npmjs.com/package/@microsoft/fetch-event-source), and the event writers in [better-sse](https://www.npmjs.com/package/better-sse) and [hono's `streamSSE`](https://hono.dev/docs/helpers/streaming#streamsse).

```sh
npm install @portable/sse
```

Read events from any response, such as a streaming LLM API:

```ts
import * as Sse from '@portable/sse';
import * as Streams from '@portable/streams';

const response = await fetch('https://api.example.com/v1/chat', { method: 'POST', headers, body });
const events = response.body!.pipeThrough(new Sse.DecoderStream());
for await (const event of Streams.toAsyncIterable(events)) {
  console.log(event.data);
}
```

`Streams.toAsyncIterable` from `@portable/streams` iterates a stream in every runtime. Where the runtime iterates streams itself, `for await (const event of events)` also works.

Keep a stream open the way `EventSource` does, with your own method, headers and body:

```ts
const events = Sse.connect(new Request('https://example.com/feed', { headers: { authorization } }), {
  signal: controller.signal,
});
```

Write events from a server:

```ts
const body = messages.pipeThrough(new Sse.EncoderStream());
return new Response(body, { headers: { 'content-type': 'text/event-stream' } });
```

## API

### `Sse.Event`

What the decoder and `connect` produce, with the same values `EventSource` gives a `MessageEvent`:

| Field | Type | Value |
| --- | --- | --- |
| `event` | `string` | The block's `event` field, or `'message'`. |
| `data` | `string` | The block's `data` fields joined with `\n`. |
| `id` | `string \| undefined` | The last event ID: the value of the most recent `id` field in the stream, or `undefined` if the stream hasn't sent one. |
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
| `attempts` | `Infinity` | How many attempts in a row, counting the first, may fail before `connect` stops reconnecting, as in `WebSockets.connect` and `Timers.retry`. An accepted response resets the count, and the end of its body counts as the first failure, so `attempts: 1` never reconnects. When the count is used up, the stream errors with the last error, or closes if the last response ended normally. A value below 1 throws a `RangeError`. |
| `delay` | `{ initial: 1000, max: 30_000 }` | Wait before each reconnect: milliseconds, exponential backoff `{ initial, max, factor?, jitter? }` (full jitter by default), or `({ attempt, error }) => ms`. `attempt` counts reconnects since the last accepted response. A `retry` field from the server replaces it. It is `Timers.Delay` from `@portable/timers`, and an invalid one throws a `RangeError`. |
| `fetch` | `globalThis.fetch` | Sends each `Request`. Pass a wrapper to change each request before it is sent, for example to set a fresh token. |
| `idleTimeout` | `Infinity` | How long to wait, in ms, for the response headers and then for each chunk of the body. If no data arrives in that time, `connect` aborts the request and handles the attempt as a failed connection with a `TimeoutError` `DOMException`, so by default it reconnects. Keep-alive comment lines from the server also restart the wait. Set it a little above the server's keep-alive interval, so a stalled connection reconnects and a quiet but healthy one doesn't. |
| `maxLength` | `Infinity` | As in `DecoderStream`. |
| `reconnectIf` | see below | `(error, { attempt }) => boolean \| Promise<boolean>`, called after each connection ends while `attempts` isn't used up. `error` is `undefined` when the response ended normally. Return `false` to stop reconnecting: the stream then closes if `error` is `undefined`, and errors with `error` otherwise. |
| `signal` | | Fails the stream with `signal.reason`. |

By default `connect` reconnects after every error except `ResponseError` and `MaxLengthError`, and after a response that ends normally. For a request you don't want repeated, such as an LLM completion, pass `reconnectIf: () => false`. To also retry a 5xx response:

```ts
Sse.connect(request, {
  reconnectIf: (error) => !(error instanceof Sse.ResponseError) || error.response.status >= 500,
});
```

## Types

| Type | Description |
| --- | --- |
| `Sse.Event` | An event read from a stream, as `EventSource` would dispatch it. |
| `Sse.Message` | A message to write to an event stream. Every field is optional, so you can pass an `Sse.Event`. |
| `Sse.Delay` | The `delay` option, `Timers.Delay` from `@portable/timers`. |
| `Sse.Backoff` | `{ initial, max, factor?, jitter? }`, exponential backoff for `delay`. |

## Why use this over eventsource-parser, eventsource and fetch-event-source

eventsource-parser only reads. The `eventsource` polyfill and fetch-event-source only connect, through callbacks, and neither returns a stream you can pipe or cancel. better-sse and hono only write. This package does all three with web streams and no dependencies outside `@portable/*`.

- On Node 24, `DecoderStream` decoded bytes 1.4× faster than `TextDecoderStream` piped into eventsource-parser's `EventSourceParserStream` on one LLM token event per chunk, 1.7× faster on 2 to 16 byte chunks and 1.6× faster on a 1 MB line in 128-byte chunks, and ran at the same speed on 16 KB chunks. `connect` read a mocked response 1.5× faster than `fetch` with the same pair. The exception is `decode` on one complete string, which ran at about two thirds of the speed of eventsource-parser's `createParser().feed` on short events, and at the same speed on the 1 MB line. See `test/*.bench.ts`.
- Events have the values that `EventSource` gives: `event` defaults to `'message'`, and `id` is the last event ID, so an `id` from a block without data isn't lost. eventsource-parser reports `id` only on the block that set it.
- fetch-event-source dispatches a block without `data` as an empty message, accepts `text/event-streaming` as a content type, retries an HTTP error forever, and uses `window` and `document`, so it fails in Workers and Node. It also ignores a signal that is already aborted.
- The `eventsource` polyfill can't send a body without a custom `fetch`. Its issue #326 reports events lost on mixed CRLF and LF line breaks, which `test/DecoderStream.conformance.ts` covers.
- better-sse writes multi-line `data` as one `data:` line, so every line after the first is lost, and strips trailing line breaks.
- With `maxLength`, the result is the same however the input is chunked.

`test/PARITY.md` maps every upstream test to ours and lists the upstream bugs this package handles differently.

<!-- bench:start -->
<table>
<thead><tr><th align="left">Library</th><th align="right">Ops/s</th><th align="left">Relative</th><th></th></tr></thead>
<tbody>
<tr><th colspan="4" align="left">Decode 2,000 LLM token events, one per chunk</th></tr>
<tr><td>@portable/sse</td><td align="right">365</td><td></td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="160" height="12" alt="" /></td></tr>
<tr><td>Hand-written with web APIs</td><td align="right">280</td><td>1.3× slower</td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="123" height="12" alt="" /></td></tr>
<tr><td>eventsource-parser</td><td align="right">252</td><td>1.4× slower</td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="110" height="12" alt="" /></td></tr>
<tr><th colspan="4" align="left">Decode named events in 16 KB chunks</th></tr>
<tr><td>eventsource-parser</td><td align="right">1,380</td><td>same</td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="160" height="12" alt="" /></td></tr>
<tr><td>@portable/sse</td><td align="right">1,370</td><td></td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="159" height="12" alt="" /></td></tr>
<tr><td>Hand-written with web APIs</td><td align="right">794</td><td>1.7× slower</td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="92" height="12" alt="" /></td></tr>
<tr><th colspan="4" align="left">Decode events in 2 to 16 byte chunks</th></tr>
<tr><td>@portable/sse</td><td align="right">560</td><td></td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="160" height="12" alt="" /></td></tr>
<tr><td>Hand-written with web APIs</td><td align="right">500</td><td>1.1× slower</td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="143" height="12" alt="" /></td></tr>
<tr><td>eventsource-parser</td><td align="right">332</td><td>1.7× slower</td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="95" height="12" alt="" /></td></tr>
<tr><th colspan="4" align="left">Decode a 1 MB data line in 128-byte chunks</th></tr>
<tr><td>@portable/sse</td><td align="right">81.3</td><td></td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="160" height="12" alt="" /></td></tr>
<tr><td>eventsource-parser</td><td align="right">52.4</td><td>1.6× slower</td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="103" height="12" alt="" /></td></tr>
<tr><th colspan="4" align="left">Decode 2,000 LLM token events from one string</th></tr>
<tr><td>eventsource-parser</td><td align="right">8,300</td><td>1.6× faster</td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="160" height="12" alt="" /></td></tr>
<tr><td>@portable/sse</td><td align="right">5,120</td><td></td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="99" height="12" alt="" /></td></tr>
<tr><th colspan="4" align="left">Encode LLM token events</th></tr>
<tr><td>@portable/sse</td><td align="right">12,100</td><td></td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="160" height="12" alt="" /></td></tr>
<tr><td>Hand-written with web APIs</td><td align="right">5,400</td><td>2.2× slower</td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="71" height="12" alt="" /></td></tr>
<tr><th colspan="4" align="left">Encode LLM token events through <code>EncoderStream</code></th></tr>
<tr><td>@portable/sse</td><td align="right">235</td><td></td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="160" height="12" alt="" /></td></tr>
<tr><td>Hand-written with web APIs</td><td align="right">201</td><td>1.2× slower</td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="137" height="12" alt="" /></td></tr>
<tr><th colspan="4" align="left">Connect and read 2,000 events</th></tr>
<tr><td>@portable/sse</td><td align="right">346</td><td></td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="160" height="12" alt="" /></td></tr>
<tr><td>eventsource-parser</td><td align="right">225</td><td>1.5× slower</td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="104" height="12" alt="" /></td></tr>
<tr><td>eventsource</td><td align="right">189</td><td>1.8× slower</td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="87" height="12" alt="" /></td></tr>
</tbody>
</table>

Operations per second from `pnpm bench`, higher is better, in Node 24.22.0, on Intel(R) Xeon(R) Processor @ 2.10GHz (4 cores). Each benchmark lists only the libraries that can do the same work, fastest first. The relative speed compares each library with @portable/sse, and the bars are scaled to the fastest library.

| Library | Version | Minified and gzipped | Runtime dependencies | Node built-ins | TypeScript types |
| --- | --- | ---: | ---: | --- | --- |
| @portable/sse | – | 1.8 kB | 4 | none | included |
| eventsource-parser | 4.1.2 | 1.9 kB | 0 | none | included |
| eventsource | 5.1.3 | 3.6 kB | 1 | none | included |
| Hand-written with web APIs | – | built in | – | none | – |

Sizes cover the imports in the usage example, or the equivalent imports of each library, bundled for the browser by `scripts/bundle-size.ts`. Runtime dependencies count every package installed with the published package. A library that uses Node built-ins needs polyfills in a browser and the `nodejs_compat` flag in Cloudflare Workers.
<!-- bench:end -->

- eventsource-parser's `onComment` and `onError` callbacks have no equivalent. Comments and invalid lines are ignored, as `EventSource` ignores them.
- An event without its closing blank line is dropped at the end of a stream, as `EventSource` does. Some servers omit the last blank line, and their last event is lost in both.
- `connect` reconnects after a response that ends normally, like `EventSource`. fetch-event-source stops there instead. Pass `reconnectIf: () => false` for the same behavior.
- `connect` doesn't close the stream while a browser tab is hidden. fetch-event-source closes it by default.
- `connect` doesn't set `cache: 'no-store'`, because Cloudflare Workers needs a compatibility flag for it. Set `cache` on the `Request` if you need it.
- `data` is a string, so call `JSON.stringify` before writing an object. better-sse's `session.push` serializes the data itself.
- better-sse sends keep-alive comments itself. With `EncoderStream`, write `{ comment: '' }` on an interval.
