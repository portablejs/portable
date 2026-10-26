# Test parity

Upstream suites:

- [JSONStream 1.3.5 `test/`](https://github.com/dominictarr/JSONStream/tree/master/test). Fixtures `all_npm.json`, `couch_sample.json`, `depth.json`, `error.json`, and `header_footer.json` are copied from it (MIT or Apache-2.0, Dominic Tarr).
- [stream-json 3.7.0 `tests/`](https://github.com/uhop/stream-json/tree/master/tests).
- [json-stream-stringify 3.1.7 `test-src/JsonStreamStringify.spec.ts`](https://github.com/Faleij/json-stream-stringify/blob/master/test-src/JsonStreamStringify.spec.ts).
- [@worker-tools/json-stream `test/`](https://github.com/worker-tools/json-stream/tree/master/test).

Test names below are the `describe > test` names in `DecoderStream.conformance.ts` (P) and `encodeStream.conformance.ts` (E). NDJSON is in @portable/jsonl, whose `PARITY.md` maps the ndjson suite and stream-json's JSON Lines tests.

## JSONStream

| Upstream test | Covered by | Notes |
| --- | --- | --- |
| bool.js | P `JSONStream > reads back what encodeStream writes` | Writes values with a stringifier and parses them back. |
| browser.js | P `JSONStream > emits matches from text written in one chunk` | |
| destroy_missing.js | P `DecoderStream > cancelling the output cancels the input` | Tests that a net socket ending early ends the parser. Web streams cancel instead. |
| doubledot1.js | P `JSONStream > emits a field of every row at any depth below rows` | `rows..rev` is `$.rows..rev`. |
| doubledot2.js | P `JSONStream > emits every value named "value" below docs, inner matches first` | |
| empty.js | P `JSONStream > emits nothing for an empty array and each element of a full one` | |
| error_contents.js | P `JSONStream > emits only the other paths when the selected key is missing` | JSONStream's `header` event becomes extra paths. |
| fn.js | P `JSONStream > emits each row of a large document` | A function that accepts numeric keys is `[*]`. Function filters aren't supported. Filter the output stream instead. |
| gen.js | skipped | Disabled upstream (`return` on line 1). It checks memory on a 100,000-row file. P `stream-json > parses a document nested 100,000 levels deep` and the benchmark parse large input. |
| header_footer.js | P `JSONStream > emits the values around a selected array when their paths are given` | `header` and `footer` events become extra paths, emitted in document order. |
| issues.js #66 | P `JSONStream > fails on malformed input` | |
| issues.js #81 | P `JSONStream > parses a nested key without error` | |
| keys.js keys via string, keys via array | P `JSONStream > reports the key of each match` | `$*` and `{emitKey: true}` are the last element of `path`. |
| keys.js path via array | P `JSONStream > reports the key of each match` | Every match includes its `path`. |
| keys.js advanced keys | P `JSONStream > reports keys of nested matches` | |
| keys.js parent keys | P `JSONStream > emits a top-level key once with its value` | |
| map.js map function, filter function | skipped | No mapper. Pipe the output through a `TransformStream` or `Streams.map` and `Streams.filter`. |
| multiple_objects.js | P `JSONStream > parses several documents written back to back` | |
| multiple_objects_error.js | P `JSONStream > fails on a document with an extra closing brace` | |
| null.js | P `JSONStream > emits null values` | Deliberate difference: JSONStream drops null matches, but `DecoderStream` emits them. |
| parsejson.js | P `JSONStream > keeps numbers exact` | Tests jsonparse's number parsing. |
| run.js | skipped | Test runner, not a test. |
| stringify.js, stringify_object.js, two-ways.js | E `json-stream-stringify > writes a stream as an array`, P `JSONStream > reads back what encodeStream writes` | `JSONStream.stringify()` is `encodeStream(stream)`. `stringifyObject` has no equivalent. Build an object whose values are promises or streams. |
| test.js | P `JSONStream > emits each row of a large document` | `/\d+/` is `[*]`. |
| test2.js | P `JSONStream > emits the whole document for the root path` | |

## json-stream-stringify

| Upstream test | Covered by | Notes |
| --- | --- | --- |
| null, Infinity, date, true, Symbol, 1, `"\n"`, `"漢字"`, `{}`, `/regex/gi`, `{undefined:null}`, `{"":null}`, `{a:undefined}`, `{a:null}`, `{a:1,b:undefined}`, `{a:1,b:Promise(undefined)}`, `{a:date}`, `({a:1,b:{c:2}})`, `{a:[1], "b": 2}`, `[]`, `[[[]],[[]]]`, `[1, undefined, 2]`, `[1, , 2]`, `[1,'a']`, `Promise(1)`, `Promise(Promise(1))`, `{a:Promise(1)}` | E `json-stream-stringify > writes … as JSON.stringify does` (one test each) | |
| `{a:0n}` should be `{"a":0}` | E `stream-json > fails on a BigInt, as JSON.stringify does` | Deliberate difference: `encodeStream` follows `JSON.stringify` and fails. Add `BigInt.prototype.toJSON` or a replacer to write them. |
| 1 should be 2 (replacer), `{a:undefined}` should be `{"a":1}`, `{a:1, b:2}` should be `{"a":1}` | E `json-stream-stringify > calls a replacer function` | |
| `{a:1,b:2}` should be `{"b":2}` | E `json-stream-stringify > writes only the keys in a replacer array` | |
| `{a:1}` should be `{"a":1}` | E `json-stream-stringify > writes … nested objects as JSON.stringify does` | |
| `{a:function(){}, b: "b"}`, `[function(){}]`, `[function(){}, undefined]` | E `json-stream-stringify > calls a function property and writes what it returns` | Deliberate difference: a function is called and its result written. These functions return `undefined`, so the output matches. |
| `{ a: array, "b": array }` | E `json-stream-stringify > writes a repeated, non-circular reference each time` | |
| Promise(fakePromise(Promise.resolve(1))) | E `json-stream-stringify > resolves a thenable that resolves to a promise` | |
| Promise.reject(Error) should emit Error | E `json-stream-stringify > fails with the rejection reason of a promise` | |
| readableStream(1), Promise(readableStream(1)), `{a:ReadableStream(1,2,3)}` | E `json-stream-stringify > writes a stream as an array` | |
| `{a:[readableStream(1, Error, 2)]}` should emit Error | E `json-stream-stringify > fails with the error of a nested stream` | |
| readableStream(…).resume() should emit Error | E `json-stream-stringify > fails on a stream that is already being read` | A web stream that is being read is locked, so `getReader` throws. |
| EndedReadableStream should emit Error | E `known upstream issues > writes a stream that has already closed as an empty array` | A closed web stream has no lost data to report. |
| `{key:"value",data:readableStream("hello")}`, `{a:"b",c:readableStream("d"),e:"f"}`, `readableStream('a','b','c')` should be `"abc"` (both) | E `json-stream-stringify > writes a stream between other properties`, `reads a stream that produces values slowly` | Deliberate difference: a stream of strings is an array of strings. Node streams have an object mode and web streams don't, so there's no way to tell a text stream from a stream of string values. To embed text, pass `Streams.toText(stream)`, a promise. |
| `readableStream({}, 'a', undefined, 'c')` | E `json-stream-stringify > writes a stream as an array` | |
| `{ a: readableStream({name, date}) }`, `{ a: readableStream({name, arr, date}) }` | E `json-stream-stringify > writes objects with dates from a stream` | |
| space option (3 tests) | E `json-stream-stringify > indents with a number of spaces`, `indents with a string` | |
| cyclic structure (5 tests) | skipped | The `cycle` option writes Crockford `$ref` objects. Few callers use it, and the output needs a matching decoder. |
| circular structure (3 tests) | E `json-stream-stringify > fails on a circular object`, `… behind promises`, `… inside a stream` | |
| decycle should not be active | E `json-stream-stringify > writes a repeated, non-circular reference each time` | |
| bad reader | E `json-stream-stringify > reads a stream only as fast as the output is read` | Tests Node `_read` being called out of turn. Web streams don't call `pull` again until the previous call finishes. |
| prePush | skipped | Tests a private buffer field. |

## @worker-tools/json-stream

| Upstream test | Covered by | Notes |
| --- | --- | --- |
| index.test.ts transform streams, stringify | skipped | These check that exports exist, and every other test uses them. |
| json-parse-stream exists, ctor | P `@worker-tools/json-stream > emits each element read one at a time` | |
| simple, simple reader read | P `@worker-tools/json-stream > emits each element read one at a time` | The default path there is `$.*` and ours is `$`, so the test passes `$[*]`. |
| read all | P `@worker-tools/json-stream > emits every value with $..*, children before parents` | |
| promise value I–IV, read only until first value (eager, lazy, lazy II), lazy promise map, lazy promise map x2, two streams, two generators, boxy selector, from file/fetch, promise/streams/iterations throws without data source, stream remains open when only promises left | skipped | `JSONParseNexus` passes one input to several lazy consumers. Use one `DecoderStream` with several `paths` and route matches by `path`. |
| json-fetch.test.ts (9 tests) | E `@worker-tools/json-stream > produces a Response body any JSON parser can read`, P `@worker-tools/json-stream > reads a body built by encodeStream` | `JSONStreamRequest`/`JSONStreamResponse` are `new Response(encodeStream(value))`. "GET with body throws" tests `Request`, not JSON. |
| json-path.test.ts exists | skipped | Export check. |
| json-path `*` | P `stream-json > picks values at a given depth` | |
| json-path `..`, `.. with follow-up` | P `@worker-tools/json-stream > matches .. at any depth and only at the named key` | |
| json-path selection, selection num, range | P `@worker-tools/json-stream > selects array elements by index`, `selects quoted names` | Unions `[a,b]` and slices `[0:2]` aren't supported. Pass one path per member or index. |
| json-stringify exists | skipped | Export check. |
| json-stringify simple, with promise, with generator | E `@worker-tools/json-stream > writes plain values as JSON.stringify does`, `writes promises and async generators` | |
| circular throws | E `@worker-tools/json-stream > fails on a circular object` | |
| duplicates do not throw | E `@worker-tools/json-stream > writes duplicate references` | |
| promises that resolve to undefined are omitted | E `json-stream-stringify > writes a promise of undefined as JSON.stringify does` | |
| undefined values in generators become null | E `@worker-tools/json-stream > writes undefined from an async generator as null` | |
| undefined toJSON result | E `@worker-tools/json-stream > omits a property whose toJSON returns undefined` | |
| playground stringify stream, roundtrip | E `json-stream-stringify > writes a stream as an array`, P `@worker-tools/json-stream > reads a body built by encodeStream` | `JSONStringifyStream` writes a JSON array, as `encodeStream(stream)` does. |
| playground Retrieving multiple values and collections | P `JSONStream > emits the values around a selected array when their paths are given` | |

## stream-json

stream-json is a toolkit built around a token stream: a parser emits tokens, and filters, streamers, and assemblers turn them into values. This package has no token stream, so tests of tokens, filters that rewrite a document, and Node-only plumbing don't apply. `tests/web/*` repeat the `tests/node/*` cases through web stream wrappers, with "(web)" in the name, and each maps to the row of the same node test. `tests/web/test-web.js` (3 tests) checks that the web subpath exports wrappers, so there is nothing to map.

| Upstream test | Covered by | Notes |
| --- | --- | --- |
| parser: streaming values, packing values, packing no streaming values, jsonStreaming number tokens for adjacent values | skipped | Token stream internals. |
| parser: escaped | P `stream-json > parses escaped back to the same value` | |
| parser: survives roundtrip (13 tests) | P `stream-json > parses <name> back to the same value` | One test each. |
| parser: sliding window 1–13 | P `stream-json > parses the same value from <n>-character chunks` | |
| parser: json streaming 1, 5, 5 with space, 5 with newline | P `stream-json > parses <n> documents separated by …` | |
| parser: error #1 | P `stream-json > fails on an unclosed object` | |
| parser: error #2 | P `stream-json > fails on a mismatched bracket` | |
| parser: infinite fail | P `stream-json > fails on garbage in an endless stream instead of hanging` | |
| parser: empty stream | P `stream-json > emits nothing for empty input` | |
| parser: issue #167 zero byte, newline, tab | P `stream-json > fails on … inside a string` | |
| parser: jsonStreaming adjacent number then array, object, string, true | P `stream-json > parses values that touch without whitespace` | |
| verifier: valid array, with newlines, with CRLF, valid jsonStreaming, exponent followed by EOF | P `stream-json > roundtrips`, `parses 5 documents separated by "\n"`, `parses a number with an exponent at the end of input` | There is no separate verifier. The parser fails on invalid input. |
| verifier: error position (3 tests) | P `stream-json > fails on a missing comma`, `DecoderStream > gives the offset of a bad character outside the selected values` | The error gives a character offset, not line and column. |
| verifier: comma in jsonStreaming | P `stream-json > fails on a comma between top-level values` | |
| verifier: mismatched bracket, infinite fail, issue #167 (3 tests) | as the parser rows above | |
| pick: pick events, packed events, packed events no streaming | skipped | Token stream internals. |
| pick: objects | P `stream-json > picks values at a given depth` | |
| pick: objects string filter | P `stream-json > picks one value by path` | |
| pick: objects regexp filter | P `stream-json > picks values by several paths` | A RegExp over the joined path becomes a list of JSONPaths. |
| pick: objects empty filter | P `stream-json > picks nothing for a path that matches nothing` | |
| pick: objects once | P `DecoderStream > cancelling the output cancels the input` | The test reads one match, then cancels. |
| pick: array, object | P `stream-json > streams the elements of a picked array and the members of a picked object` | |
| pick: with global RegExp flag | skipped | RegExp filters aren't supported. |
| pick: maxDepth (4 tests) | P `stream-json > parses a document nested 100,000 levels deep` | The parser keeps its stack in arrays, so depth costs memory, not call stack, and there is no limit to configure. |
| streamArray: stream array | P `stream-json > emits each element of a top-level array` | |
| streamArray: fail | P `stream-json > selects object members with [*], as JSONPath does` | Deliberate difference: a path selects values and doesn't assert the type of their parent. |
| streamArray/streamObject/streamValues: filter, filter include undecided, replacer and reviver (8 tests) | skipped | Assembler callbacks. Filter or map the output stream instead. |
| streamObject: stream object, no streaming | P `JSONStream > reports the key of each match` | |
| streamObject: fail | P `stream-json > selects nothing with an index when the value is an object` | |
| streamValues: stream values, no streaming tokens | P `stream-json > parses 5 documents separated by " "` | |
| streamValues: no values | P `stream-json > emits nothing for empty input` | |
| filter (10 tests), ignore (9 tests), replace (18 tests) | skipped | These rewrite a document by dropping or replacing tokens. This package selects values, and rewriting a document is out of scope. |
| assembler (12 tests), flexAssembler (27 tests) | skipped | Token assembly, revivers, and custom containers. `__proto__` handling is covered by P `stream-json > creates "__proto__" as an own property, as JSON.parse does`. |
| disassembler: roundtrip | E `encodeStream > matches JSON.stringify for nested plain values with indentation` | |
| disassembler: bad top-level values, bad values in object, bad values in array | E `json-stream-stringify > calls a function property and writes what it returns`, `writes … as JSON.stringify does` | |
| disassembler: dates | E `json-stream-stringify > writes a date as JSON.stringify does` | |
| disassembler: chained toJSON | E `stream-json > calls toJSON on the value toJSON returns only once` | |
| disassembler: custom toJSON | E `stream-json > calls toJSON with the key` | |
| disassembler: custom toJSON filter top level, custom replacer filter top level | E `stream-json > writes nothing when the replacer drops the root value` | |
| disassembler: custom replacer | E `stream-json > calls the replacer with the holder as this` | |
| disassembler: custom replacer array | E `json-stream-stringify > writes only the keys in a replacer array` | |
| disassembler: NaN, Infinity, -Infinity (4 tests) | E `stream-json > writes NaN, Infinity and -Infinity as null` | |
| disassembler: bigint (4 tests) | E `stream-json > fails on a BigInt, as JSON.stringify does` | Deliberate difference, as for json-stream-stringify. |
| stringer: roundtrip, no packing, useValues | E `encodeStream > matches JSON.stringify for nested plain values with indentation` | |
| stringer: json streaming objects, json streaming primitives, all jsonl parser and jsonl stringer tests | @portable/jsonl | JSON Lines. Mapped in `packages/jsonl/test/PARITY.md`. |
| stringer: json streaming objects as array | E `json-stream-stringify > writes a stream as an array` | |
| stringer: no input as array | E `stream-json > writes an empty stream as an empty array` | |
| stringer: special symbols, control characters with useValues | E `stream-json > writes special characters as JSON.stringify does` | |
| jsonc parser, stringer, verifier (90 tests), file jsonc (6 tests) | skipped | JSONC (comments and trailing commas) is a different format. |
| parseFile, stringerToFile, verifyFile (17 tests) | skipped | `node:fs` helpers. |
| batch (6 tests), emitter (2 tests), drain (6 tests), pipe (4 tests), withParser (1 test), main source test | skipped | Node stream plumbing and stream-chain helpers. Use `Streams.batch` for batching. |
| browser-safety (3 tests), subpath exports (6 tests) | skipped | Packaging checks. Our lint rules reject Node APIs in `src/`. |
| property tests: chunk boundaries do not change the token stream | P `DecoderStream > gives the same matches for every way of splitting the bytes` | |
| property tests: parser → assembler round-trips against JSON.parse | oracle `DecoderStream matches JSONStream > random document <n>` | |
| property tests: disassembler → stringer round-trips against JSON.stringify | oracle `encodeStream matches json-stream-stringify > random value <n>` | |
| property tests: jsonc comments survive chunk boundaries | skipped | JSONC. |
| PathMatcher and FlexAssembler path properties (4 tests) | P `@worker-tools/json-stream > matches .. at any depth and only at the named key`, `selects quoted names` | |

## Known upstream issues

| Issue | Test |
| --- | --- |
| JSONStream #145: `{"]` ends quietly with no error and no data. | P `known upstream issues > fails instead of ending quietly on {"] (JSONStream #145)` |
| JSONStream accepts a trailing comma; its own `couch_sample.json` fixture has one. | P `known upstream issues > fails on a trailing comma, which JSONStream accepts` |
| JSONStream drops matches whose value is `null` (`null.js` asserts this). | P `known upstream issues > emits null matches (JSONStream drops them)` |
| JSONStream #10, #129: numbers in exponential notation fail to parse. | P `known upstream issues > parses numbers in exponential notation (JSONStream #10)` |
| JSONStream #32, #101: parsing a large file runs out of memory, because jsonparse keeps the parents of every match. | P `stream-json > parses a document nested 100,000 levels deep`. Parents of a match are never built. |
| stream-json #63: array indexes are wrong when values aren't streamed. | P `known upstream issues > counts array indexes in skipped arrays (stream-json #63)` |
| stream-json #104, #68, #79: invalid JSON doesn't fail, or the parser hangs. | P `known upstream issues > fails on invalid JSON in a part of the document no path selects (stream-json #104)`, `stream-json > fails on garbage in an endless stream instead of hanging` |
| stream-json #167: raw control characters inside strings are accepted. | P `stream-json > fails on … inside a string` |
| json-stream-stringify #47: a stream that isn't the first property produces invalid JSON. | E `known upstream issues > writes a stream that is not the first property as valid JSON (json-stream-stringify #47)` |
| json-stream-stringify #28: empty keys are dropped. | E `known upstream issues > writes keys that are empty strings (json-stream-stringify #28)` |
| json-stream-stringify #34, #4: empty arrays and repeated references are reported as circular. | E `known upstream issues > does not report empty arrays as circular (json-stream-stringify #34)`, `json-stream-stringify > writes a repeated, non-circular reference each time` |
| json-stream-stringify #7: the output has a trailing comma when the replacer drops the last key. | E `known upstream issues > writes no trailing comma when the replacer drops the last key (json-stream-stringify #7)` |
| json-stream-stringify #1: a promise returned by the replacer is not resolved. | E `known upstream issues > resolves a promise returned by the replacer (json-stream-stringify #1)` |
| json-stream-stringify #36: the stream hangs on a source that has already ended. | E `known upstream issues > writes a stream that has already closed as an empty array (json-stream-stringify #36)` |
| json-stream-stringify #41, #43: items of large object-mode streams are lost. | E `known upstream issues > writes a large array of streamed objects without losing any (json-stream-stringify #41, #43)` |
| @worker-tools/json-stream: cancelling the output doesn't stop a source that is waiting for data. | E `encodeStream > cancelling the output cancels a nested stream that is waiting for data` |

The oracle tests pass JSONStream only valid JSON with no `null` values, because JSONStream drops null matches.
