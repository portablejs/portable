# Test parity

`@portable/streams` is designed fresh, so these tables map each upstream test to our test for the same case, or give the reason it doesn't apply. Test names are `describe > test` in `collect.conformance.ts`, `combine.conformance.ts`, `bridge.conformance.ts` and `streams.oracle.test.ts`. `fallback.test.ts` runs the three conformance files again in Node with `ReadableStream.from`, `values()` and `[Symbol.asyncIterator]` deleted, as in Chromium 141.

Upstream suites, read at these versions: [get-stream 9.0.1](https://github.com/sindresorhus/get-stream/tree/main/test), [merge2 1.4.1](https://github.com/teambition/merge2/blob/master/test/index.js), [merge-stream 2.0.0](https://github.com/grncdr/merge-stream/blob/master/test.js), [concat-stream 2.0.0](https://github.com/max-mapper/concat-stream/tree/master/test), [through2 5.0.11](https://github.com/rvagg/through2/tree/master/test), [raw-body 4.0.0](https://github.com/stream-utils/raw-body/tree/master/test), [stream-to-array 2.3.0](https://github.com/stream-utils/stream-to-array/blob/master/test/index.js) and [bl 7.0.12](https://github.com/rvagg/bl/tree/master/test). The get-stream fixtures (`unicorn\n` in each chunk type) are rebuilt in `collect.conformance.ts` from get-stream's `test/fixtures/index.js` (MIT, Sindre Sorhus).

## API changes

| Upstream | Ours | Why |
| --- | --- | --- |
| `getStream`, `getStreamAsBuffer`, `getStreamAsArrayBuffer`, `getStreamAsArray` | `toText`, `toBytes`, `toArray`, plus `toJson` | One verb per result type. `toBytes` returns a `Uint8Array`; `.buffer` is an exactly sized `ArrayBuffer`. |
| `maxBuffer` (characters for text, elements for arrays) | `maxBytes`, always bytes; no limit on `toArray` | A limit on untrusted input is about memory, which is bytes. Object streams come from code the caller controls. |
| `MaxBufferError`, `error.bufferedData` | `MaxBytesError` with `maxBytes`; no partial data | Keeping partial data on the error holds up to `maxBytes` in memory after the caller has given up on it. |
| Chunks of `ArrayBuffer`, `DataView`, any typed array | `Uint8Array` or `string` only; anything else is a `TypeError` | AGENTS.md: bytes are `Uint8Array`. A `Uint16Array` chunk in a byte stream is almost always a bug. |
| concat-stream's `encoding` option and type inference from the first chunk | Pick the collector | The result type no longer depends on what the stream happens to send first. |
| `merge2(a, [b, c])`, `merge2().add()`, `{ end: false }` | `concat(a, merge(b, c))` | Two functions that compose. Web streams can't gain sources after construction. |
| `through2(fn)` with `this.push` and callbacks | `map`, `filter`, `tap`, `batch`, `transform(async function* ...)` | Return values and generators instead of callbacks. A returned `undefined` is a value; use `filter` to drop chunks. |
| raw-body's `limit` (`'1mb'` strings), `length`, `encoding`, HTTP status codes | `maxBytes` (a number), `toText`'s `encoding` | No string parsing, and no HTTP concepts in a stream package. Compare `Content-Length` with `maxBytes` before reading. |
| A string or array as the source is rejected by get-stream | Arrays and other iterables are accepted; strings are rejected | Iterables are valid sources everywhere in this package. |

## get-stream

| Upstream test | Covered by | Notes |
| --- | --- | --- |
| `contents.js` works with async iterable | `get-stream: sources > reads an async iterable` | |
| `contents.js` async iterable .return() is called on error, but not .throw() | `get-stream: sources > calls an async iterable's return() on error, but not throw()` | |
| `contents.js` get stream with mixed chunk types | `get-stream: sources > reads mixed chunk types` | Strings, `Uint8Array` and a subclass. Other views are rejected. |
| `contents.js` getStream should not affect additional listeners | doesn't apply | A web stream has one reader at a time; Node `data` listeners are Node stream internals. |
| `contents.js` set error.bufferedData when stream errors (×4: Error, string, null, undefined) | `get-stream: sources > rejects with the source's error when it throws …` (×4) | We reject with the thrown value unchanged and don't attach `bufferedData`. |
| `contents.js` handles infinite stream | `get-stream: sources > stops an infinite source at maxBytes` | |
| `contents.js` Throws if the first argument is undefined, null, a string | `get-stream: sources > rejects a … source` (×3) | |
| `contents.js` Throws if the first argument is an array | `get-stream: sources > reads an array of chunks` | Deliberate: arrays are iterables. |
| `string.js` get stream from … to string, with a single chunk (×9) | `get-stream: toText > reads … as text, with a single chunk`, `> rejects a … chunk` | `string`, `Uint8Array`, with offset, subclass (for `Buffer`) are read. `ArrayBuffer`, `Uint16Array`, `DataView` (with and without offset) are rejected. |
| `string.js` get stream from … to string, with multiple chunks (×6) | `get-stream: toText > reads … as text, with multiple chunks`, `> rejects a … chunk` | As above. |
| `string.js` get stream from object/array/boolean/number/bigint/undefined/symbol to string | `get-stream: toText > rejects a … chunk` | Also `null`. |
| `string.js` maxBuffer throws when size is exceeded with a string | `get-stream: toText > fails when maxBytes is exceeded` | |
| `string.js` maxBuffer unit is characters with getStream() | `get-stream: toText > counts maxBytes in UTF-8 bytes, also for string chunks` | Deliberate: the unit is bytes. |
| `string.js` set error.bufferedData when `maxBuffer` is hit (×2) | doesn't apply | No `bufferedData`; see API changes. |
| `string.js` handles streams larger than string max length (×2) | doesn't apply | Needs over 512 MB of memory per run. Past the engine's string limit, `toText` rejects with the engine's `RangeError` and cancels the source. |
| `string.js` getStream() behaves like text() | `get-stream: toText > decodes like Response.text()` | Compared with `Response.text()`, on random valid UTF-8. Chromium 141's streaming `TextDecoder` turns an ASCII byte after an invalid sequence split across chunks (`f0` \| `d4 be 25`) into U+FFFD, so random bytes test the browser, not us. Invalid sequences are covered by the tests below. |
| `string.js` get stream with partial UTF-8 sequences | `get-stream: toText > decodes a multi-byte character split across chunks` | |
| `string.js` get stream with truncated UTF-8 sequences | `get-stream: toText > replaces a truncated multi-byte character at the end` | |
| `string.js` handles truncated UTF-8 sequences over maxBuffer | `get-stream: toText > fails when a truncated character exceeds maxBytes` | |
| `string.js` get stream with invalid UTF-8 sequences | `get-stream: toText > replaces an invalid UTF-8 sequence` | |
| `buffer.js` get stream from … to buffer (×15) | `get-stream: toBytes > reads … as bytes …`, `> rejects a … chunk` | As for `string.js`. |
| `buffer.js` get stream from object/…/symbol to buffer | `get-stream: toBytes > rejects a … chunk` | |
| `buffer.js` maxBuffer throws when size is exceeded with a buffer | `get-stream: toBytes > fails when maxBytes is exceeded` | |
| `buffer.js` maxBuffer unit is bytes with getStreamAsBuffer() | `get-stream: toBytes > counts string chunks as their UTF-8 bytes` | |
| `buffer.js` set error.bufferedData … (×2) | doesn't apply | No `bufferedData`. |
| `buffer.js` getStreamAsBuffer() behaves like buffer() | `get-stream: toBytes > reads like Response.arrayBuffer() and Blob` | |
| `buffer.js` getStreamAsBuffer() only works in Node | doesn't apply | `toBytes` returns a `Uint8Array` in every runtime. |
| `array-buffer.js` get stream from … to arrayBuffer (×15) and invalid types (×7) | `get-stream: toBytes > reads …`, `> rejects a … chunk`, `> returns a fresh buffer of exactly the read length` | |
| `array-buffer.js` maxBuffer throws … with an arrayBuffer, typedArray, uint16Array, dataView | `get-stream: toBytes > fails when maxBytes is exceeded`, `> rejects a … chunk` | The non-`Uint8Array` views are rejected before the limit applies. |
| `array-buffer.js` maxBuffer unit is bytes with getStreamAsArrayBuffer() | `get-stream: toBytes > counts string chunks as their UTF-8 bytes` | |
| `array-buffer.js` set error.bufferedData … (×2) | doesn't apply | No `bufferedData`. |
| `array-buffer.js` behaves like arrayBuffer(), can behave like blob() | `get-stream: toBytes > reads like Response.arrayBuffer() and Blob` | |
| `array.js` get stream from … to array (×15) | `get-stream: toArray > keeps a … chunk as it is`, `> keeps multiple … chunks as they are` | |
| `array.js` get stream from object/…/symbol to array | `get-stream: toArray > accepts a … chunk` | |
| `array.js` maxBuffer unit is each array element | doesn't apply | `toArray` has no limit; see API changes. |
| `array.js` set error.bufferedData … (×2) | doesn't apply | No `bufferedData`. |
| `array.js` behaves like readable.toArray() | `get-stream: Node streams as async iterables > reads a Readable` (oracle file) | |
| `array.js` can stream JSON | `get-stream: toArray > reads many object chunks` | stream-json is a Node stream library. |
| `stream.js` Can use Readable stream, Duplex stream | `get-stream: Node streams as async iterables > reads a Readable`, `> reads a Duplex` | Node-only, so in the oracle file. |
| `stream.js` Can use already ended Readable, Duplex | `… > reads an already ended Readable as empty`, `… Duplex …` | |
| `stream.js` Throw if already aborted Readable, Duplex | `… > rejects a destroyed Readable`, `… Duplex` | |
| `stream.js` Throw when erroring Readable, Duplex; already errored | `… > rejects with the error of an errored Readable`, `… Duplex` | |
| `stream.js` Throw when throwing error in Readable read() | `… > rejects when read() throws` | |
| `stream.js` Handles maxBuffer errors | `… > destroys the stream when maxBytes is exceeded` | |
| `stream.js` Can emit "error" event right after getStream(); Throw when aborting; emitting "error" event (×4); Duplex read() throw; Readable destroy() throw; Duplex final() throw; Does not wait for Duplex writable side; Handle non-error instances; Handles objectMode errors; Works if Duplex readable side ends first; Cleans up event listeners; multiple successive fast/slow reads; Can call twice at the same time; Can call and listen to "data" at the same time | doesn't apply | Node stream events and internals. We read a Node stream only through its async iterator, whose behavior Node owns. |
| `web-stream.js` Can use ReadableStream | `get-stream: ReadableStream > reads a ReadableStream` | |
| `web-stream.js` Can use already ended ReadableStream | `get-stream: ReadableStream > reads an already ended ReadableStream as empty` | |
| `web-stream.js` Can use already canceled ReadableStream | `get-stream: ReadableStream > reads an already cancelled ReadableStream as empty` | |
| `web-stream.js` Can use already errored ReadableStream | `get-stream: ReadableStream > rejects with the error of an errored ReadableStream` | |
| `web-stream.js` Cancel ReadableStream when maxBuffer is hit | `get-stream: ReadableStream > cancels the ReadableStream when maxBytes is exceeded` | |
| `web-stream-ponyfill.js` (web-stream.js without async iteration), Should not polyfill ReadableStream | `fallback.test.ts`, and the browser run in Chromium 141 | `fallback.test.ts` also checks the natives stay deleted. |
| `integration.js` can use TextDecoderStream | `get-stream: ReadableStream > reads text decoded by a TextDecoderStream` | |
| `integration.js` works with fetch(), ReadableStream | `raw-body: web streams > reads the body of a Response` | No network in tests. |
| `integration.js` Node/Browser entrypoint works with … (×6); opendir(); createReadStream() (×2); child_process.spawn(); readableWebStream (×2) | doesn't apply | One entry point; Node file and process APIs. A Node `Readable` is covered in the oracle file. |

## concat-stream

| Upstream test | Covered by | Notes |
| --- | --- | --- |
| `array.js` array stream | `concat-stream > array stream` | `toArray` keeps each chunk; `.flat()` joins arrays. |
| `buffer.js` buffer stream | `concat-stream > buffer stream` | |
| `buffer.js` buffer mixed writes | `concat-stream > buffer mixed writes`, `> rejects number chunks` | Number and number-array chunks are rejected; see known issues. |
| `infer.js` type inference works as expected | doesn't apply | No inference; the caller picks the collector. |
| `nothing.js` no callback stream | doesn't apply | No callback. |
| `nothing.js` no encoding set, no data | `concat-stream > no encoding set, no data` | |
| `nothing.js` encoding set to string, no data | `concat-stream > encoding set to string, no data` | |
| `objects.js` writing objects; switch to objects encoding … | `concat-stream > writing objects` | |
| `string.js` string -> buffer stream | `concat-stream > string -> buffer stream` | |
| `string.js` string stream | `concat-stream > string stream` | |
| `string.js` end chunk | `concat-stream > end chunk` | |
| `string.js` string from mixed write encodings | `concat-stream > string from mixed write encodings` | Uses `Uint8Array` for the number array. |
| `string.js` string from buffers with multibyte characters | `concat-stream > string from buffers with multibyte characters` | |
| `string.js` string infer encoding with empty string chunk | `concat-stream > string infer encoding with empty string chunk` | |
| `string.js` to string numbers | `concat-stream > rejects number chunks` | Deliberate. |
| `typedarray.js` typed array stream | `concat-stream > typed array stream` | |
| `typedarray.js` typed array from strings, buffers, and arrays | `concat-stream > typed array from strings, buffers, and arrays` | |
| `server/ls.js` ls command | doesn't apply | `child_process`. |

## raw-body (limit handling)

Only the web stream suite applies. `index.spec.ts`, `flowing.spec.ts`, `http.spec.ts`, `http2.spec.ts` and `native.spec.ts` test Node streams, HTTP requests, callbacks, `length`, string limits like `'1kb'`, iconv decoders and AsyncLocalStorage, none of which this package has. Their limit cases (limit exceeded, limit as the exact size, no limit) are the same as the web cases below.

| Upstream test (`webstream.spec.ts`) | Covered by | Notes |
| --- | --- | --- |
| should validate stream | `get-stream: sources > rejects a … source` | |
| should read a ReadableStream into a buffer | `raw-body: web streams > reads a ReadableStream into bytes` | |
| should read an empty ReadableStream | `raw-body: web streams > reads an empty ReadableStream` | |
| should work with encoding; with `true` as an option | `raw-body: web streams > reads text` | |
| should decode multi-byte characters split across chunks | `raw-body: web streams > decodes multi-byte characters split across chunks` | |
| should work with string chunks | `raw-body: web streams > reads string chunks into bytes` | |
| should read a TextDecoderStream as a utf-8 Buffer | `raw-body: web streams > reads a TextDecoderStream as UTF-8 bytes` | |
| should error on string chunks when encoding is set | doesn't apply | `toText` keeps string chunks as text; it never re-decodes them. |
| should work with a custom decoder; decode encodings unsupported by TextDecoder; decoder throws while writing / at the end | doesn't apply | No custom decoder. Use `transform` for a non-`TextDecoder` charset. |
| should work with the callback style; not invoke the callback synchronously; not catch or re-invoke a callback that throws | doesn't apply | Promises only. |
| should check length; error with length mismatch; error early when length > limit | doesn't apply | No `length`; see API changes. |
| should error when limit is exceeded | `raw-body: web streams > fails when maxBytes is exceeded` | |
| should error for an unsupported encoding | `get-stream: toText > decodes other encodings` | An unknown label throws `TextDecoder`'s `RangeError`. |
| should error when the stream is locked | `raw-body: web streams > rejects a locked stream` | |
| should error when the body was already consumed | `raw-body: web streams > rejects a body that was already consumed` | |
| should error when the stream is locked by a pipe | `raw-body: web streams > rejects a stream locked by a pipe` | |
| should read a cancelled stream as an empty body | `raw-body: web streams > reads a cancelled stream as empty` | |
| should read an already-read stream as an empty body | `raw-body: web streams > reads an already-read stream as empty` | |
| should map aborts to request.aborted; destroyed Readable.toWeb streams; aborted fetch Response body | `raw-body: web streams > rejects with the error of a stream that fails after a chunk` | We reject with the stream's own error, such as the `AbortError`, instead of mapping it to an HTTP error. |
| should propagate stream errors | `raw-body: web streams > rejects with the error of a stream that fails after a chunk` | |
| should normalize non-Error stream failures; reject when the stream errors without a reason | `raw-body: web streams > rejects with the reason of a stream that fails with a non-Error` | Deliberate: the reason is passed on unchanged. |
| should error when the stream yields an invalid chunk | `raw-body: web streams > rejects an invalid chunk and releases the lock` | |
| should error when the stream yields non-byte chunks | `raw-body: web streams > rejects an ArrayBuffer chunk instead of miscounting it` | |
| should assemble a large multi-chunk body | `raw-body: web streams > assembles a large multi-chunk body` | |
| should release the lock when finished | `raw-body: web streams > releases the lock when finished` | |
| should read the body of a fetch Response; stream of a Blob; body of a fetch Request | `raw-body: web streams > reads the body of a Response`, `> reads the stream of a Blob`, `> reads the body of a Request` | |
| should read the readable side of a TransformStream | `raw-body: web streams > reads the readable side of a TransformStream` | |
| should release the lock on error | `raw-body: web streams > releases the lock on error` | |

## stream-to-array

| Upstream test | Covered by | Notes |
| --- | --- | --- |
| as a function: should work; should work as a promise | `stream-to-array > should work as a promise` | |
| as a function: should work as a promise with zalgo | `stream-to-array > should work as a promise with zalgo` | |
| as a function: should work as a promise with chucky | `stream-to-array > should work as a promise with chucky` | |
| as a function: should not swallow errors | doesn't apply | Tests a callback that throws. |
| as a function: should handle stream errors | `stream-to-array > should handle stream errors` | |
| as a method (×4) | doesn't apply | Installing `toArray` on a stream object. |

## bl

bl's tests are almost all about `BufferList`, a random-access list of buffers (`get`, `slice`, `shallowSlice`, `copy`, `indexOf`, `readUInt*`, `append`, `prepend`, `consume`, `duplicate`, `isBufferList`, conversions). This package only replaces bl's use as a collector, `new BufferListStream((err, data) => ...)`. The `BufferList` tests in `test.js`, `indexOf.js`, `convert.js` and `isBufferList.js` don't apply.

| Upstream test | Covered by | Notes |
| --- | --- | --- |
| write nothing, should get empty buffer | `bl > write nothing, should get empty buffer` | |
| unicode string | `bl > unicode string` | |
| test String appendage | `bl > test String appendage` | |
| test Number appendage | `concat-stream > rejects number chunks` | Deliberate. |
| should emit finish; destroy no pipe; destroy with error; destroy with pipe … (×4); handle error | doesn't apply | Node stream lifecycle. Errors are covered by `get-stream: ReadableStream > rejects with the error of an errored ReadableStream`. |

## merge2

| Upstream test | Covered by | Notes |
| --- | --- | --- |
| merge2(read1, read2, through3) | `merge2 > merge2(read1, read2, through3)` | `concat` |
| merge2 - error handling | `merge2 > merge2 - error handling` | Errors always propagate; there is no `pipeError` flag. |
| merge2(TransformStream) | `merge2 > merge2(TransformStream)` | |
| merge2(read1, [read2, through3], through4, [through5, read6]) | `merge2 > merge2(read1, [read2, through3], through4, [through5, read6])` | `concat(read1, merge(read2, through3), through4, merge(through5, read6))` |
| merge2().add(read1, [read2, through3], through4, [through5, read6]) | doesn't apply | No `add()`; build the list before calling `concat`. Same ordering as the test above. |
| merge2(read1, read2, through3, {objectMode: false}) | `merge2 > merge2(read1, read2, through3, {objectMode: false})` | |
| merge2([read1, read2]) with classic style streams | doesn't apply | Node streams1. |
| merge2(read1, read2, {end: false}) | doesn't apply | A web stream can't gain sources after construction. |
| merge2(merge2(through4, [through5, read6]), read1, [read2, through3]) | `merge2 > merge2(merge2(through4, [through5, read6]), read1, [read2, through3])` | |

The oracle tests compare `concat` with `merge2(a, b, c)`, `merge` with `merge2([a, b, c])`, and `concat(a, merge(b, c))` with `merge2(a, [b, c])` on Node `Readable`s.

## merge-stream

| Upstream test | Covered by | Notes |
| --- | --- | --- |
| smoke | `merge-stream > smoke` | All 74 sources are passed at once instead of added every 6 ms. |
| pause/resume | `merge-stream > reads no further than the reader asks` | Web streams pause by not reading. |
| array | `merge-stream > array` | |
| isEmpty | doesn't apply | No `add()`, so the source list is known. `merge()` with no sources is covered by `merge > with no sources is empty`. |
| propagates errors | `merge-stream > propagates errors` | Also checks the other source is cancelled. |

## through2

The map and filter cases map to `map`, `filter`, `tap` and `batch`; stateful cases map to `transform`.

| Upstream test | Covered by | Notes |
| --- | --- | --- |
| `web.js` classicControllerEnqueue | `through2: web > classicControllerEnqueue` | A generator that yields twice. |
| `web.js` asyncReturnedValueEnqueued | `through2: web > asyncReturnedValueEnqueued` | `filter` |
| `web.js` asyncgenFanOut, asyncgenFilter | `through2: web > asyncgenFanOut`, `> asyncgenFilter` | |
| `web.js` flushClassic, flushAsync | `through2: web > flushClassic and flushAsync` | Code after the `for await` loop is the flush. |
| `web.js` asyncRejectedPropagates | `through2: web > asyncRejectedPropagates` | |
| `web.js` asyncgenThrownPropagates | `through2: web > asyncgenThrownPropagates` | |
| `web.js` noopDefault | `through2: web > noopDefault` | |
| `web.js` asyncgenWritableBackpressure | `through2: web > asyncgenWritableBackpressure` | Also checks the source is never more than a few chunks ahead. |
| `web.js` asyncgenCancelRunsFinally | `through2: web > asyncgenCancelRunsFinally` | |
| `web.js` asyncgenReaderBackpressure | `through2: web > asyncgenReaderBackpressure` | Also checks the generator runs at most one value ahead. |
| `test.js` classicByteTransform | `through2: node > classicByteTransform` | `map` with the chunk index instead of `this._i`. |
| `test.js` classicNoopTransform, classicCallbackShorthand, legacyDefault | `through2: node > classicNoopTransform and classicCallbackShorthand` | A plain `TransformStream`. |
| `test.js` classicFlush, asyncgenWithClassicFlush | `through2: node > classicFlush and asyncgenWithClassicFlush` | |
| `test.js` asyncReturnedValuePushed | `through2: node > asyncReturnedValuePushed` | |
| `test.js` asyncUndefinedSkipsEmission | `through2: node > asyncUndefinedSkipsEmission` | `filter`; `map` passes `undefined` on as a value. |
| `test.js` asyncRejectedPropagatesError | `map, filter, tap, batch > a throwing function errors the stream` | |
| `test.js` asyncgenOneToOne, asyncgenFanOut, asyncgenFilter, asyncgenThrownPropagates | `through2: node > asyncgenOneToOne`, `through2: web > asyncgenFanOut`, `> asyncgenFilter`, `> asyncgenThrownPropagates` | |
| `test.js` objectTransformPassthrough, legacyDefaultObj, legacyDefaultCtor | `through2: node > objectTransformPassthrough and legacyDefaultObj` | |
| `test.js` objectTransformFromReadable | `through2: node > objectTransformFromReadable` | |
| `test.js` transformerReusableFactory | `through2: node > transformerReusableFactory` | Each call to `map` is a new stream. |
| `test.js` transformerOptionsMerge, transformerOverrideOptions | doesn't apply | Node stream options. |
| `test.js` transformerAsyncSupported | `through2: node > transformerAsyncSupported` | |
| `test.js` transformerAsyncgenSupported | `through2: node > transformerAsyncgenSupported` | |
| `test.js` asyncgenDownstreamBackpressure | `through2: node > asyncgenDownstreamBackpressure` | |
| `test.js` asyncgenWritableBackpressure | `through2: web > asyncgenWritableBackpressure` | |
| `test.js` asyncgenDestroyMidStream | `through2: node > asyncgenDestroyMidStream` | |
| `test.js` asyncgenDestroyRunsFinally | `through2: node > asyncgenDestroyRunsFinally` | The generator starts on the first read, so the test reads once before cancelling. |

## Known upstream issues

| Issue | How we handle it | Test |
| --- | --- | --- |
| get-stream 9.0.1: `getStreamAsArrayBuffer(stream, { maxBuffer: 0 })` throws `TypeError: Method ArrayBuffer.prototype.resize called on incompatible receiver` instead of `MaxBufferError`. Found by the oracle test, which leaves out `0`. | `maxBytes: 0` accepts an empty source and fails any byte with `MaxBytesError`. | `MaxBytesError > maxBytes: 0 accepts only an empty source` |
| [get-stream #116](https://github.com/sindresorhus/get-stream/issues/116): failed on Chrome because it needed `ReadableStream` async iteration. | Collectors read with `getReader()`; `fromIterable` and `toAsyncIterable` fall back when the natives are missing. | Browser run in Chromium 141; `fallback.test.ts` |
| [get-stream #42](https://github.com/sindresorhus/get-stream/issues/42): `maxBuffer` didn't stop buffering. | The source is cancelled as soon as the limit is crossed. | `get-stream: ReadableStream > cancels the ReadableStream when maxBytes is exceeded`, `limitBytes > fails with MaxBytesError and cancels the source past the limit` |
| [get-stream #50](https://github.com/sindresorhus/get-stream/issues/50): never completed for a stream that had already ended. | | `get-stream: ReadableStream > reads an already ended ReadableStream as empty` |
| [concat-stream #50](https://github.com/max-mapper/concat-stream/issues/50): callback never fired when the stream errored. | Collectors reject. | `get-stream: ReadableStream > rejects with the error of an errored ReadableStream` |
| [concat-stream #57](https://github.com/max-mapper/concat-stream/issues/57): writing a number exposed uninitialized `Buffer` memory. | Number chunks are a `TypeError`. | `concat-stream > rejects number chunks` |
| [concat-stream #19](https://github.com/max-mapper/concat-stream/issues/19): an object stream of numbers was collected into a `Buffer`. | `toArray` keeps chunks as they are. | `get-stream: toArray > accepts a number chunk` |
| raw-body `webstream.spec.ts` "non-byte chunks": an `ArrayBuffer` had no `.length`, which made the limit `NaN` and turned it off. | Only `Uint8Array` and `string` chunks are counted; anything else is a `TypeError`. | `raw-body: web streams > rejects an ArrayBuffer chunk instead of miscounting it` |
| [merge-stream #26](https://github.com/grncdr/merge-stream/issues/26): never ended with no sources. | `merge()` and `concat()` with no sources close at once. | `merge > with no sources is empty`, `concat > with no sources is empty` |
| [merge-stream #13, #24](https://github.com/grncdr/merge-stream/issues/24), [merge2 #7](https://github.com/teambition/merge2/issues/7): errors were not propagated. | An error in any source errors the output and cancels the other sources. | `merge-stream > propagates errors`, `concat > an error in one source cancels the sources not yet read` |
| [merge-stream #28](https://github.com/grncdr/merge-stream/issues/28), [merge2 #25](https://github.com/teambition/merge2/issues/25): output order surprised users. | `concat` keeps source order; `merge` is documented as arrival order. | `concat > joins streams, iterables and async iterables in order`, `merge > passes chunks on in the order they arrive` |
| through2's async-generator transform needed Node `drain` and a queue of 16 chunks for backpressure. | `transform` pulls one output per read and the input waits for the generator. | `through2: web > asyncgenWritableBackpressure`, `> asyncgenReaderBackpressure` |

## Benchmarks

get-stream's `benchmarks/` times each function on a 100 MB file against `node:stream/consumers`. `collect.bench.ts` collects 6.8 MB of web stream chunks with `toBytes` and `toText` against get-stream and against `Response.arrayBuffer()` and `Response.text()`, and fails if get-stream is more than 25% faster.
