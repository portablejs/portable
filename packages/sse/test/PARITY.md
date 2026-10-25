# Test parity

Upstream suites, read at these versions:

- [eventsource-parser 4.1.2](https://github.com/rexxars/eventsource-parser) `test/parse.test.ts`, `test/stream.test.ts`, `test/benchmark-fixtures.test.ts`. `fixtures/multibyte.ts` copies its `MULTIBYTE_LINES` and `MULTIBYTE_EMOJIS` (MIT, Espen Hovlandsdal).
- [eventsource 5.1.3](https://github.com/EventSource/eventsource) `test/client.test.ts`.
- [@microsoft/fetch-event-source 2.0.1](https://github.com/Azure/fetch-event-source) `src/parse.spec.ts`.
- [better-sse 0.16.1](https://github.com/MatthewWid/better-sse) `src/**/*.test.ts`.
- [hono 4.13.13](https://github.com/honojs/hono) `src/helper/streaming/sse.test.tsx`.
- [WPT `eventsource/`](https://github.com/web-platform-tests/wpt/tree/master/eventsource), for the tests that apply outside a browser.

Test names below are `file > describe > test`. `D` is `DecoderStream.conformance.ts`, `E` is `EncoderStream.conformance.ts`, `C` is `connect.conformance.ts`, and `O` is `DecoderStream.oracle.test.ts`.

## Deliberate differences

- `event` is `'message'` when the block has no `event` field, as in `MessageEvent.type`. eventsource-parser gives `undefined`.
- `id` is the last event ID, as in `MessageEvent.lastEventId`: it keeps its value until another `id` field changes it, so an `id` from a block without data applies to later events. eventsource-parser reports an `id` only on the block that set it, plus `onId`. The oracle test converts its output with `onId`.
- `retry` is reported on the next event, because a `retry` field usually comes in a block without data. eventsource-parser has `onRetry` instead.
- No `onComment`, `onError` or `reset()`. Comments and unknown fields are ignored, as `EventSource` ignores them.
- `maxLength` applies to every line and to the `data` of one event, so the same input fails the same way however it is chunked. eventsource-parser's `maxBufferSize` counts only the unfinished line and the data, and drops lines that can't become a field without counting them.
- A rejected response is left unread on `ResponseError.response`, so a caller can read the error body. The `eventsource` polyfill aborts it.
- `connect` takes `attempts`, which limits failed attempts in a row as `WebSockets.connect` and `Timers.retry` do (C > when to stop > attempts …). `EventSource` and the `eventsource` polyfill reconnect without a limit, and fetch-event-source stops only when `onerror` throws.
- `connect` sends no `cache: 'no-store'`. Cloudflare Workers rejected the `cache` option until 2024 and still needs a compatibility flag for it. A caller who wants it sets it on the `Request`.

## eventsource-parser

| Upstream test | Covered by | Notes |
| --- | --- | --- |
| basic unnamed events stream | D > eventsource-parser > reads a stream of unnamed events | |
| stream of `time` event name | D > eventsource-parser > reads named events | |
| stream of `time` event names, unbalanced chunks | D > eventsource-parser > reads named events split into uneven chunks at every position | Every split point instead of random ones. |
| stream of identified messanges + retry interval | D > eventsource-parser > reads ids and a retry interval | |
| stream of "heartbeat" comments, unnamed events | D > eventsource-parser > ignores heartbeat comments between events | No `onComment`. |
| stream of multi-line data events | D > eventsource-parser > joins multi-line data with LF | |
| stream of multi-byte events | D > eventsource-parser > reads multi-byte text | Also fed one byte at a time. |
| stream of multi-byte events with some empty lines thrown in | D > eventsource-parser > reads multi-byte text after empty lines | |
| stream of leading bom | D > eventsource-parser > strips a leading BOM in bytes | |
| stream containing decoded U+FEFF byte-order marks (multiple places) | D > eventsource-parser > strips a leading BOM in text, and ignores the line after a later one | |
| stream containing byte-order mark (multiple places) | D > eventsource-parser > strips only one leading BOM in bytes, and ignores later ones | |
| UTF-8 BOM is stripped when bytes are decoded with a default `TextDecoder` | D > eventsource-parser > strips a leading BOM in bytes | We decode bytes ourselves. |
| a decoded U+FEFF (from an `ignoreBOM` decoder) is stripped like the raw 3-byte BOM | D > eventsource-parser > strips a leading BOM in text, and ignores the line after a later one | |
| a BOM split after byte %i survives empty decoder output | D > eventsource-parser > strips a BOM split across byte chunks, with empty chunks between | |
| a raw BOM split as $chunks is stripped | D > eventsource-parser > strips a BOM split across byte chunks, with empty chunks between | Raw BOMs are bytes here, not Latin-1 strings. |
| an incomplete raw BOM %j is preserved on mismatch | D > eventsource-parser > an incomplete BOM is not a BOM | |
| reset discards an incomplete raw BOM %j | skipped | No `reset()`. A new `DecoderStream` starts fresh, and `connect` restarts the parser on each response (C > reconnecting > strips a BOM at the start of each response, and drops an unfinished event). |
| only one leading BOM %j is stripped | D > eventsource-parser > strips only one of two leading BOMs | |
| empty chunks do not make a later BOM a leading BOM | D > eventsource-parser > empty chunks do not make a later BOM a leading BOM | |
| stream using carriage returns | D > eventsource-parser > splits lines on CR | |
| stream using line feeds | D > eventsource-parser > splits lines on LF | |
| stream using carriage returns and line feeds | D > eventsource-parser > splits lines on CRLF | |
| stream with varying odd uses of comments | D > eventsource-parser > ignores comments of every shape | |
| stream with even more odd uses of comments | D > eventsource-parser > ignores comments mixed with CR, CRLF and NUL, and drops an unfinished event | |
| stream with empty `event` field | D > eventsource-parser > an empty event field gives the default type | |
| stream with empty `retry` field | D > eventsource-parser > ignores an empty retry field | |
| stream with oddly shaped data field | D > eventsource-parser > reads data fields with and without a value | |
| stream with cr separating chunks of same event | D > eventsource-parser > a CRLF split across chunks is one line break | |
| stream with partially incorrect retry fields | D > eventsource-parser > ignores a retry field that is not all digits | No `onError`. |
| stream with `id` field containing a NULL character | D > eventsource-parser > ignores an id field containing NUL | |
| reports an `id` from a block without data when the block is dispatched | D > eventsource-parser > an id from a block without data applies to later events | No `onId`. The id appears on later events. |
| reports an `id` before dispatching an event from the same block | D > eventsource-parser > reads ids and a retry interval | |
| reports an `id` from a block using %s line endings | D > eventsource-parser > reads an id-only block ended with %s | |
| stream with incorrect retry fields | D > eventsource-parser > ignores a retry field that is not all digits | |
| stream with unknown fields in the stream | D > eventsource-parser > ignores unknown fields | |
| stream with huge data chunks | D > eventsource-parser > reads an event of 10 MB of data | Checks the data itself instead of a SHA-256 the stream sends. |
| skips onError when the stream is invalid but not newline-terminated (through `reset()`) | D > eventsource-parser > a body that is not an event stream gives no events | No `onError`. |
| skips onError when ... (through `reset()` with `consume: false`) | D > eventsource-parser > a body that is not an event stream gives no events | |
| skips onError when an invalid line was discarded before reset({consume: true}) | skipped | No `reset({ consume })`. |
| calls onError when the stream is invalid (through newline) | D > eventsource-parser > a body that is not an event stream gives no events | No `onError`. The events are what a caller sees. |
| calls onError when the stream is invalid (no field separator) | D > eventsource-parser > a body that is not an event stream gives no events | |
| maxBufferSize: discards unterminated unknown fields without buffering | D > maxLength > applies to every line, including complete ones in one chunk | Deliberately different, see above. |
| maxBufferSize: discards invalid lines as soon as their field name cannot become valid | D > maxLength > applies to every line, including complete ones in one chunk | Deliberately different. |
| maxBufferSize: preserves split valid fields while discarding invalid lines | D > eventsource-parser > reads a field split across chunks | |
| maxBufferSize: triggers on pending fragment overflow (no terminator) | D > maxLength > fails when an unfinished line grows past it | |
| maxBufferSize: discards unterminated comments when no onComment callback exists | D > maxLength > applies to every line, including complete ones in one chunk | Deliberately different. |
| discarded unterminated comments consume crlf as one line terminator | D > eventsource-parser > a comment ended by a CRLF split across chunks is one line | |
| discarded lines consume a crlf split across chunks as one line terminator | D > eventsource-parser > a comment ended by a CRLF split across chunks is one line | |
| discarded lines terminated by a bare cr resume parsing on the next chunk | D > eventsource-parser > a %s ended by a CR at the end of a chunk is one line | |
| discarded lines arriving with their own bare cr terminator do not swallow the next line | D > eventsource-parser > a %s ended by a CR at the end of a chunk is one line | |
| discarded lines arriving with a trailing cr consume a following lf as one terminator | D > eventsource-parser > a %s ended by a CR at the end of a chunk is one line | |
| bare field lines terminated by a cr at a chunk boundary are processed, not discarded | D > eventsource-parser > a %s ended by a CR at the end of a chunk is one line | `data field` case. |
| unknown field lines completed by a cr at a chunk boundary still emit unknown-field errors | D > eventsource-parser > a %s ended by a CR at the end of a chunk is one line | The `unknown field` case. No `onError`. |
| a blank cr line ending a chunk dispatches the pending event exactly once | D > eventsource-parser > a blank line split across chunks as CR, CR LF dispatches once | |
| maxBufferSize: preserves unterminated comments when onComment callback exists | D > eventsource-parser > reads a comment split across chunks | |
| maxBufferSize: triggers on data buffer overflow (no blank line) | D > maxLength > fails when an event has more data than it allows, before a blank line | |
| maxBufferSize: feed throws after overflow, until reset | skipped | The stream is errored permanently, and there is no `reset()`. |
| maxBufferSize: stops processing overflowing data within one chunk (%j) | D > maxLength > delivers the events before the one that fails | |
| maxBufferSize: checks completed data after joining a pending field (%j) | D > maxLength > gives the same result however the input is chunked | |
| maxBufferSize: dispatches multiple buffered events at the exact limit (%j) | D > maxLength > allows events up to the limit (%j) | |
| maxBufferSize: counts the separator added by a bare data field (%j) | D > maxLength > counts the LF between data lines | |
| maxBufferSize: preserves events dispatched before an overflow | D > maxLength > delivers the events before the one that fails | |
| maxBufferSize: checks data terminated by a trailing carriage return | D > maxLength > gives the same result however the input is chunked | |
| maxBufferSize: discards the overflowing chunk when onError resets the parser | skipped | No `onError` or `reset()`. |
| maxBufferSize: not triggered when events dispatch within the limit | D > maxLength > allows many small events | |
| maxBufferSize: undefined option means unbounded (default behavior) | D > eventsource-parser > drops an unfinished line at the end | |
| passing a function to `createParser` will throw with helpful error | skipped | No callback API. |
| can use `EventSourceParserStream` | D > DecoderStream > reads a Response body | |
| reports IDs from blocks without data | C > reconnecting > an ID from a block without data is used for reconnecting and later events | |
| maxBufferSize: terminates the stream when onError is `terminate` | D > maxLength > fails when an unfinished line grows past it | Always terminates. |
| maxBufferSize: invokes custom onError function and errors the stream | D > maxLength > fails when an unfinished line grows past it | |
| maxBufferSize: errors before dispatching overflowing data in one chunk | D > maxLength > delivers the events before the one that fails | |
| benchmark fixtures (`benchmark-fixtures.test.ts`, 4 tests) | skipped | They test the benchmark's fixture generators. `DecoderStream.bench.ts` builds its own inputs, and O compares random streams. |

## eventsource

Tests of the `EventSource` interface (`readyState`, `on*` handlers, `addEventListener`, `target`, the constants, the fetch-override symbol, `withCredentials` and `url` validation) don't apply: `connect` returns a `ReadableStream`, not an `EventTarget`. The rows below say where the behavior behind each one is tested.

| Upstream test | Covered by | Notes |
| --- | --- | --- |
| stops dispatching buffered $name events when a listener closes the connection | C > cancelling > cancelling the stream aborts the response in flight | Events not read before `cancel()` are dropped. |
| dispatches every buffered $name event while open | C > reconnecting > reconnects when the response ends, with the last event ID | |
| can connect, receive message, manually disconnect | C > connect > reads events from the response | |
| `target` on open, message and error events is the EventSource instance | skipped | No events on a target. |
| can connect using URL string only | C > connect > accepts a URL string, a URL and a Request | |
| passes `no-store` to `fetch`, avoiding cache | skipped | Deliberately different, see above. |
| can handle unicode data correctly | D > eventsource-parser > reads multi-byte text | |
| can use `es.onopen` / `es.onerror` / `es.onmessage` ..., nulling it unsubscribes (4 tests) | skipped | No handlers. |
| `es.onmessage` does not fire for non-`message` events | D > WPT eventsource > format-field-event | Callers filter on `event`. |
| can redeclare `es.onopen` / `es.onerror` / `es.onmessage` (3 tests) | skipped | No handlers. |
| on-handlers fire in registration order relative to `addEventListener` | skipped | No handlers. |
| message event contains correct properties | C > connect > reads events from the response | `origin`, `timeStamp` and `cancelable` belong to DOM events. |
| will reconnect with last received message id if server disconnects | C > reconnecting > reconnects when the response ends, with the last event ID | |
| message event `lastEventId` persists when a later event omits the `id` field | C > reconnecting > the last event ID persists across connections, D > WPT eventsource > format-field-id | |
| an ID-only chunk sets `lastEventId` on a later message without an ID | D > eventsource-parser > an id from a block without data applies to later events | |
| an ID from a block without data is used for reconnecting and later messages | C > reconnecting > an ID from a block without data is used for reconnecting and later events | |
| provides a UTF-8 `Last-Event-ID` byte string to custom fetch for characters $name | C > reconnecting > sends a %s ID as UTF-8 bytes | |
| sends a UTF-8 encoded `Last-Event-ID` for an ID with characters $name | C > reconnecting > sends a %s ID as UTF-8 bytes | |
| will not reconnect after explicit `close()` | C > cancelling > cancelling the stream while it waits stops reconnecting | |
| will not reconnect after explicit `close()` in `onError` | C > when to stop > reconnectIf can stop on an error, which fails the stream | |
| will have correct ready state throughout lifecycle | skipped | No `readyState`. |
| will close stream on HTTP 204 | C > when to stop > a 204 response closes the stream without reconnecting | |
| throws if `url` is not a string/url | skipped | TypeScript rejects it, and `new Request` throws a `TypeError` for a bad URL. |
| can request cross-origin | skipped | CORS is up to `fetch`. |
| redirects: handles ${status} to same origin | C > connect > sends the method, headers and body of the request on every attempt | `fetch` follows redirects, and every attempt starts from the original request. |
| redirects: handles ${status} to different origin | skipped | `fetch` strips `Authorization` on a cross-origin redirect. Nothing here changes that. |
| can use the `withCredentials` option to control cookies | skipped | Set `credentials` on the `Request`. |
| validates the event stream MIME type: $contentType | C > when to stop > checks the content type %j, C > when to stop > the content type with a non-breaking space is rejected | |
| aborts a rejected HTTP %i response before reporting failure | C > when to stop > the ResponseError keeps the body for the caller to read | Deliberately different, see above. With `reconnectIf` retrying, the body is cancelled (C > when to stop > reconnectIf can retry a 503, and the rejected body is cancelled). |
| throws on `fetch()` that does not return web-stream | skipped | The `fetch` option returns a `Response`, so the body is always a `ReadableStream` or `null` (C > reconnecting > reconnects when a 200 response has no body). |
| throws on `fetch()` that does not return a body | C > reconnecting > reconnects when a 200 response has no body | |
| throws on `fetch()` yielding chunks that are not buffers | skipped | A `Response` body yields bytes. |
| [NON-SPEC] message event contains extended properties (failed connection) | C > reconnecting > reconnects when fetch rejects | The `fetch` error reaches `reconnectIf` and `delay`. |
| [NON-SPEC] message event contains extended properties (invalid http response) | C > when to stop > a %i response fails the stream with ResponseError, without reconnecting | |
| [NON-SPEC] custom `maxBufferSize` fails connection on parser buffer overflow | C > when to stop > maxLength fails the stream without reconnecting | |
| [NON-SPEC] unrefs the reconnection timer where supported | skipped | `unref` is Node-only. An idle wait keeps a Node process alive until it ends or the signal aborts. |
| has CONNECTING / OPEN / CLOSED constant (3 tests) | skipped | No `readyState`. |
| has non-enumarable `eventsource.supports-fetch-override` symbol | skipped | Polyfill detection only. |

## fetch-event-source

| Upstream test | Covered by | Notes |
| --- | --- | --- |
| getLines > single line | D > fetch-event-source > reads a single line | |
| getLines > multiple lines | D > fetch-event-source > reads every field of one event | |
| getLines > single line split across multiple arrays | D > fetch-event-source > reads a line split across chunks | |
| getLines > multiple lines split across multiple arrays | D > fetch-event-source > reads a line split across chunks | |
| getLines > new line | D > eventsource-parser > reads data fields with and without a value | |
| getLines > comment line | D > eventsource-parser > ignores heartbeat comments between events | |
| getLines > line with no field | D > WPT eventsource > format-field-data | |
| getLines > line with multiple colons | D > fetch-event-source > reads a value with several colons | |
| getLines > single byte array with multiple lines separated by \n, \r, \r\n (3 tests) | D > eventsource-parser > splits lines on %s | |
| getMessages > happy path | D > fetch-event-source > reads every field of one event | |
| getMessages > skip unknown fields | D > fetch-event-source > a block without data is not an event | Upstream dispatches a message with empty data, against the spec. |
| getMessages > ignore non-integer retry | D > fetch-event-source > a block without data is not an event | Same. |
| getMessages > skip comment-only messages | D > fetch-event-source > a block without data is not an event, D > fetch-event-source > keeps a trailing space in the event type | Same. |
| getMessages > should append data split across multiple lines | D > fetch-event-source > appends data split across lines | |
| getMessages > should reset id if sent multiple times | D > fetch-event-source > the last id field of a block wins | |

## better-sse

Only the event writer applies. Sessions, channels, the Node `http` and HTTP/2 adapters, header handling, state, batching and the polyfill query parameters (`Session.test.ts`, `Channel.test.ts`, `createResponse.test.ts`, `createSession.test.ts`, `createChannel.test.ts`, `createEventBuffer.test.ts`, `adapters/Connection.test.ts`, 75 tests) are a server framework, which is out of scope. Their SSE output is covered by the rows below: the keep-alive comment by `writes a comment`, the initial retry by `writes a retry time`, and `push` by `writes every field of one message`.

| Upstream test | Covered by | Notes |
| --- | --- | --- |
| serializer > can override the data serializer | E > better-sse EventBuffer > writes data as given; serializing is up to the caller | `data` is a string. |
| serialize > JSON-stringifies input | E > better-sse EventBuffer > writes data as given; serializing is up to the caller | |
| sanitizer > can override the field value sanitizer | skipped | No sanitizer option. Line breaks in `data` start new data lines, and line breaks in `event` or `id` throw. |
| sanitizer > sanitizes all fields with custom-given values | skipped | Same. |
| sanitize > newline standardization (3 tests) | E > hono streamSSE > splits data on %s | |
| sanitize > strips trailing newlines | E > better-sse EventBuffer > keeps a trailing line break in data | Deliberately different: stripping it loses data. |
| event > can imperatively set the event type | E > better-sse EventBuffer > writes an event type | |
| data > can imperatively write data | E > better-sse EventBuffer > writes data as given; serializing is up to the caller | |
| data > serializes data as json | E > better-sse EventBuffer > writes data as given; serializing is up to the caller | |
| id > can imperatively set the event ID | E > better-sse EventBuffer > writes an id | |
| retry > can imperatively set the retry time | E > better-sse EventBuffer > writes a retry time | |
| comment > can imperatively write a comment | E > better-sse EventBuffer > writes a comment, with no blank line after it | |
| comment > can write a comment with no value | E > better-sse EventBuffer > writes an empty comment | |
| dispatch > writes a newline when calling dispatch | E > better-sse EventBuffer > writes every field of one message | Every message with a field ends with the blank line. |
| push > calls all field writing methods with the given data, type and id | E > better-sse EventBuffer > writes every field of one message | |
| clear > can clear the buffer contents | skipped | No buffer. `encode` returns a string. |
| read > can get the buffer contents | E > better-sse EventBuffer > writes nothing for an empty message | |
| createPushFromIterable, createPushFromStream (8 tests) | E > encode > EncoderStream output is a valid Response body | Pipe any stream of messages through `EncoderStream`. Node `Readable` support is out of scope. |

## hono

| Upstream test | Covered by | Notes |
| --- | --- | --- |
| Check streamSSE Response | E > hono streamSSE > writes event, data lines and id | Response headers are the caller's. |
| Check streamSSE Response if aborted by client | E > known upstream issues > cancelling the output cancels the source, as hono’s onAbort reports | |
| Check streamSSE Response if aborted by abort signal | E > encode > the signal fails the stream with its reason and cancels the source | |
| Should include retry in the SSE message | E > hono streamSSE > writes retry | |
| Should accept retry: 0 and not skip it | E > hono streamSSE > writes retry: 0 | |
| Should emit an empty id to reset Last-Event-ID | E > hono streamSSE > writes an empty id, which resets the last event ID | |
| Check stream Response if error occurred | E > hono streamSSE > fails the stream for an invalid message | hono writes an `error` event, and here an error fails the stream. |
| Check streamSSE Response via Promise<string> | skipped | `data` is a string. Await it before writing. |
| via JSX.Element, ErrorBoundary, Suspense (6 tests) | skipped | hono's JSX rendering. |
| Check streamSSE handles \r (CR) line ending correctly | E > hono streamSSE > splits data on %s | |
| Check streamSSE handles \r\n (CRLF) line ending correctly | E > hono streamSSE > splits data on %s | |
| Check streamSSE handles mixed line endings correctly | E > hono streamSSE > splits data on %s | |
| Should throw error if event contains \n, \r; id contains \n, \r (4 tests) | E > hono streamSSE > throws when %s contains a line break: %j | |
| Check streamSSE handles consecutive \r correctly | E > hono streamSSE > splits data on %s | |

## WPT eventsource

Tests of the `EventSource` object, document realms, workers and browser networking (`eventsource-constructor-*`, `eventsource-eventtarget`, `eventsource-onmessage-*`, `eventsource-prototype`, `eventsource-url`, `eventsource-cross-origin*`, `request-credentials`, `request-redirect`, `eventsource-request-cancellation`, `dedicated-worker/`, `shared-worker/`) don't apply outside a browser's `EventSource`.

| Upstream test | Covered by |
| --- | --- |
| format-bom.any.js | D > WPT eventsource > format-bom: a BOM after the first is part of the line |
| format-bom-2.any.js | D > WPT eventsource > format-bom-2: of two leading BOMs only the first is stripped |
| format-comments.any.js | D > WPT eventsource > format-comments |
| format-data-before-final-empty-line.any.js | D > WPT eventsource > format-data-before-final-empty-line, C > reconnecting > an ID in an event without its blank line is not used |
| format-field-data.any.js | D > WPT eventsource > format-field-data |
| format-field-event-empty.any.js | D > WPT eventsource > format-field-event-empty |
| format-field-event.any.js | D > WPT eventsource > format-field-event |
| format-field-id.any.js, format-field-id-2.any.js, format-field-id-redirect.any.js | D > WPT eventsource > format-field-id: a non-ASCII id, C > reconnecting > the last event ID persists across connections |
| format-field-id-3.window.js | D > WPT eventsource > format-field-id: the last event ID persists until an id field changes it, D > WPT eventsource > format-field-id-3: %j resets the last event ID |
| format-field-id-null.window.js | D > WPT eventsource > format-field-id-null: ignores %j, C > reconnecting > ignores an ID containing NUL |
| format-field-parsing.any.js | D > WPT eventsource > format-field-parsing |
| format-field-retry.any.js | D > WPT eventsource > format-field-retry: reads digits in base 10, C > delay > reads retry digits in base 10 and ignores other values |
| format-field-retry-bogus.any.js | D > WPT eventsource > format-field-retry-bogus: ignores a value with other characters |
| format-field-retry-empty.any.js | D > WPT eventsource > format-field-retry-empty |
| format-field-unknown.any.js | D > WPT eventsource > format-field-unknown |
| format-leading-space.any.js | D > WPT eventsource > format-leading-space: only one leading space is removed |
| format-mime-bogus.any.js, format-mime-valid-bogus.any.js, format-mime-trailing-semicolon.any.js | C > when to stop > checks the content type %j |
| format-newlines.any.js | D > WPT eventsource > format-newlines |
| format-null-character.any.js | D > WPT eventsource > format-null-character |
| format-utf-8.any.js | D > WPT eventsource > format-utf-8: bytes are always UTF-8 |
| event-data.any.js | D > WPT eventsource > event-data: field names are case-sensitive |
| eventsource-onopen.any.js, eventsource-close.window.js (first test) | C > connect > reads events from the response |
| eventsource-close.window.js (reconnect, then 204) | C > when to stop > a 204 response closes the stream without reconnecting |
| eventsource-reconnect.window.js | C > reconnecting > reconnects when the response ends, with the last event ID |
| request-accept.any.js | C > connect > sends Accept: text/event-stream unless the request sets Accept |
| request-cache-control.any.js | skipped: browsers add `Cache-Control: no-cache`. Set it on the `Request` if a proxy needs it. |
| request-status-error.window.js | C > when to stop > a 204 response closes the stream without reconnecting, C > when to stop > a %i response fails the stream with ResponseError, without reconnecting |

## Known upstream issues

| Issue | How we handle it | Test |
| --- | --- | --- |
| eventsource #326: events dropped with mixed CRLF and LF | Each line break is found separately. | D > known upstream issues > eventsource #326: mixed CRLF and LF line breaks drop no events |
| eventsource #291: `Last-Event-ID` not sent on reconnect | Sent on every reconnect after an ID arrives, and removed after an empty `id`. | C > reconnecting > reconnects when the response ends, with the last event ID, C > reconnecting > an empty id field stops sending Last-Event-ID |
| eventsource #316: no POST | Any `Request` is accepted and replayed. | C > connect > sends the method, headers and body of the request on every attempt |
| eventsource-parser #17: a CRLF split across chunks gives two events | A CR at the end of a chunk skips an LF at the start of the next. | D > eventsource-parser > a CRLF split across chunks is one line break |
| eventsource-parser #11, #13: empty data lines lost | Data lines are joined with LF. | D > known upstream issues > eventsource-parser #11 and #13: empty data lines keep their line breaks |
| eventsource-parser #19: quadratic time on a large line in small chunks | An unfinished line is kept as a list of chunks and joined once. | D > known upstream issues > eventsource-parser #19: a large line in many small chunks is read in linear time |
| eventsource-parser #26: invalid `retry` values | Only ASCII digits are read. | D > known upstream issues > eventsource-parser #26: an invalid retry value is ignored |
| eventsource-parser #18: the last event is lost when the stream ends without a blank line | Kept as in the spec and `EventSource`: an unfinished event is dropped. | D > WPT eventsource > format-data-before-final-empty-line: an event without its blank line is dropped |
| fetch-event-source: a block without `data` is dispatched as a message with empty data | No event without a `data` field. | D > fetch-event-source > a block without data is not an event |
| fetch-event-source: `content-type` checked with `startsWith`, so `text/event-streaming` passes | The MIME essence is compared. | C > when to stop > checks the content type %j |
| fetch-event-source #79: repeats the request forever on an HTTP error | A non-200 response fails the stream unless `reconnectIf` says otherwise. | C > when to stop > a %i response fails the stream with ResponseError, without reconnecting |
| fetch-event-source #88: unbounded buffer | `maxLength`. | D > maxLength > fails when an unfinished line grows past it |
| fetch-event-source #98: an already aborted signal doesn't abort | Rejects with `signal.reason` before any request. | C > cancelling > an aborted signal fails the stream before any request |
| fetch-event-source #87, #100: abort during a retry wait is lost, and abort fires no callback | The signal stops the wait and fails the stream with its reason. | C > cancelling > the signal stops a wait between attempts |
| fetch-event-source: uses `window` and `document`, so it fails in Workers and Node | Web-standard APIs only. | Every test runs in Node and Chromium. |
| better-sse #112: multi-line `data` written as one `data:` line, so later lines become unknown fields | Each line gets its own `data:` field. | E > known upstream issues > better-sse #112: multi-line data becomes several data lines, not one broken line |
| better-sse: trailing line breaks stripped from data | Kept. | E > better-sse EventBuffer > keeps a trailing line break in data |

## Benchmarks

eventsource-parser's `bench/parse.bench.ts` runs mitata over its fixture generators. `DecoderStream.bench.ts` compares `DecoderStream` with `TextDecoderStream` plus `EventSourceParserStream`, and a hand-written decoder, on LLM-style events, named events, small chunks and a 1 MB line. It also compares `decode` with `createParser().feed` on the whole text. Each fails if eventsource-parser is more than 25% faster.
