# @portable/sse

Reads, writes, and reconnects server-sent event streams (`text/event-stream`). Runs in browsers, Cloudflare Workers, Node 24+, Bun, and Deno.

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

`Streams.toAsyncIterable` from [@portable/streams](https://portablejs.com/packages/streams) works in every runtime. Where streams are async iterable, `for await (const event of events)` also works.

`connect` reconnects like `EventSource`, but with your own method, headers, and body:

```ts
const events = Sse.connect(new Request('https://example.com/feed', { headers: { authorization } }), {
  signal: controller.signal,
});
```

To write events from a server, pipe them through `EncoderStream`. This example sends a keep-alive comment every 15 seconds:

```ts
const { readable, writable } = new TransformStream<Sse.Message, Sse.Message>();
const writer = writable.getWriter();
const keepAlive = setInterval(() => {
  writer.write({ comment: '' }).catch(() => clearInterval(keepAlive));
}, 15_000);
return new Response(readable.pipeThrough(new Sse.EncoderStream()), {
  headers: { 'content-type': 'text/event-stream' },
});
```

Call `writer.write({ event: 'tick', data })` for each event. Writes reject once the client disconnects, so stop then.

## API

### `Sse.Event`

What the decoder and `connect` produce. The values match what `EventSource` gives a `MessageEvent`.

| Field | Type | Value |
| --- | --- | --- |
| `event` | `string` | The block's `event` field, or `'message'`. |
| `data` | `string` | The block's `data` fields joined with `\n`. |
| `id` | `string \| undefined` | The most recent `id` field in the stream, or `undefined` if there hasn't been one. |
| `retry` | `number \| undefined` | A `retry` field received since the previous event. |

A block without `data` isn't an event, but its `id` and `retry` still apply.

### `new Sse.DecoderStream(options)` and `Sse.decode(input, options)`

`DecoderStream` is a `TransformStream<Uint8Array | string, Sse.Event>`. `decode` reads a complete string or byte body into an array. Both follow the [WHATWG event stream rules](https://html.spec.whatwg.org/multipage/server-sent-events.html#event-stream-interpretation), and decode bytes as UTF-8. An event without its closing blank line is dropped at the end of input.

| Option | Default | Description |
| --- | --- | --- |
| `maxLength` | `Infinity` | Longest line, and longest `data` of one event, in UTF-16 code units. Longer input throws `Sse.MaxLengthError`. |
| `signal` | | `DecoderStream` only. Fails the stream with `signal.reason` and cancels its source. |

### `new Sse.EncoderStream(options)` and `Sse.encode(message)`

`EncoderStream` is a `TransformStream<Sse.Message, Uint8Array>`. `encode` returns one message as a string. A message has optional `event`, `data`, `id`, `retry`, and `comment` fields, so you can write a decoded `Sse.Event` back.

- A message with only a comment has no closing blank line, so `{ comment: '' }` works as a keep-alive.
- Multi-line `data` is split into several `data` lines, so it arrives unchanged.
- A CR or LF in `event` or `id`, a NUL in `id`, or a `retry` that isn't a non-negative integer throws `Sse.InvalidInputError`.
- `EncoderStream` takes a `signal` option, as `DecoderStream` does.

### `Sse.connect(request, options)`

Sends `request` (a `Request`, URL, or string) with `fetch` and returns a `ReadableStream<Sse.Event>` that reconnects like `EventSource`.

- It adds `Accept: text/event-stream` if the request has no `Accept` header.
- A status other than 200, or a content type other than `text/event-stream`, fails the stream with `Sse.ResponseError`. Its `response` body is unread. A 204 closes the stream.
- When a response ends or fails, `connect` waits and sends the request again with `Last-Event-ID`. An empty `id` field removes the header.
- To resume from a stored ID, e.g. after a page reload, set `Last-Event-ID` on the request.
- Cancelling the stream aborts the request and any wait. So does aborting `signal` or the request's own signal.

Every reconnect sends the request body again. `connect` clones your request when you call it, and throws a `TypeError` if its body was already read.

A `ReadableStream` body is kept in memory for as long as the stream runs. Firefox and Safari can't send one and send the text `[object ReadableStream]`, so pass `body: await Streams.toBytes(stream)` from [@portable/streams](https://portablejs.com/packages/streams) there.

| Option | Default | Description |
| --- | --- | --- |
| `attempts` | `Infinity` | How many attempts in a row may fail before `connect` stops, counting the first. An accepted response resets the count, and the end of its body counts as a failure, so `attempts: 1` never reconnects. The stream then errors with the last error, or closes if the last response ended normally. Below 1 throws a `RangeError`. |
| `delay` | `{ initial: 1000, max: 30_000 }` | Wait before each reconnect: milliseconds, `{ initial, max, factor?, jitter? }` for exponential backoff with full jitter, or `({ attempt, error }) => ms`. A `retry` field from the server replaces it. It is `Timers.Delay` from [@portable/timers](https://portablejs.com/packages/timers). An invalid value throws a `RangeError`. |
| `fetch` | `globalThis.fetch` | Sends each `Request`. Pass a wrapper to change each request, e.g. to set a fresh token. |
| `idleTimeout` | `Infinity` | Ms to wait for the response headers, then for each chunk of the body, including keep-alive comments. On timeout, the attempt fails with a `TimeoutError` `DOMException` and by default reconnects. Set it a little above the server's keep-alive interval. A value that isn't positive throws a `RangeError`. |
| `maxLength` | `Infinity` | As in `DecoderStream`. |
| `reconnectIf` | see below | `(error, { attempt }) => boolean \| Promise<boolean>`, called after each connection ends while `attempts` isn't used up. `error` is `undefined` if the response ended normally. Return `false` to stop: the stream then closes, or errors with `error` if there is one. |
| `signal` | | Fails the stream with `signal.reason`. |

By default `connect` reconnects after a normal end and after every error except `ResponseError` and `MaxLengthError`. For a request you don't want repeated, such as an LLM completion, pass `reconnectIf: () => false`. To also retry a 5xx response:

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
| `Sse.Delay` | The `delay` option, `Timers.Delay` from [@portable/timers](https://portablejs.com/packages/timers). |
| `Sse.Backoff` | `{ initial, max, factor?, jitter? }`, exponential backoff for `delay`. |

## Why use this over eventsource-parser, eventsource, and fetch-event-source

eventsource-parser only reads. The eventsource polyfill and fetch-event-source only connect, through callbacks, and return no stream you can pipe or cancel. better-sse and hono only write. This package does all three with web streams and no dependencies outside `@portable/*`.

- In Node 24, `DecoderStream` is 1.4× to 1.7× faster than eventsource-parser on small chunks and as fast on 16 KB chunks. `decode` on one complete string is slower, as the table below shows.
- Events have the values `EventSource` gives: `event` defaults to `'message'`, and `id` is the last event ID. eventsource-parser reports `id` only on the block that set it.
- fetch-event-source dispatches a block without `data` as an empty message, accepts `text/event-streaming`, retries an HTTP error forever, and ignores an already aborted signal. It uses `window` and `document`, so it fails in Workers and Node.
- The eventsource polyfill can't send a body without a custom `fetch`, and loses events on mixed CRLF and LF line breaks (issue #326).
- better-sse writes multi-line `data` as one `data:` line, so every line after the first is lost. It also strips trailing line breaks.

[test/PARITY.md](https://github.com/portablejs/portable/blob/main/packages/sse/test/PARITY.md) maps every upstream test to ours and lists the upstream bugs this package handles differently.

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

- eventsource-parser's `onComment` and `onError` have no equivalent. Comments and invalid lines are ignored, as in `EventSource`.
- An event without its closing blank line is dropped at the end of a stream, as in `EventSource`. Some servers omit it, which loses their last event.
- `connect` reconnects after a response ends normally. fetch-event-source stops there. Pass `reconnectIf: () => false` to stop.
- `connect` doesn't close the stream while a browser tab is hidden. fetch-event-source does by default.
- `connect` doesn't set `cache: 'no-store'`, because Cloudflare Workers needs a compatibility flag for it. Set `cache` on the `Request` if you need it.
- `data` is a string, so call `JSON.stringify` on an object first. better-sse's `session.push` does this for you.
- better-sse sends keep-alive comments itself. With `EncoderStream`, write `{ comment: '' }` on an interval.
