# Test parity

Upstream suites:

- [ndjson 2.0.0 `test/index.js`](https://github.com/ndjson/ndjson.js/blob/master/test/index.js). `data.ndjson` is its `test/data.txt` (BSD-3-Clause).
- [stream-json 3.7.0 `tests/`](https://github.com/uhop/stream-json/tree/master/tests): the JSON Lines tests only. The rest of stream-json is covered by @portable/json-stream.

Test names below are the `describe > test` names in `jsonl.conformance.ts`.

## ndjson

| Upstream test | Covered by | Notes |
| --- | --- | --- |
| .parse | `ndjson > decodes a line` | |
| .parse twice | `ndjson > decodes two lines` | |
| .parse - strict:true error, strict:true error event | `ndjson > fails on an invalid line` | Errors always fail the stream, and nothing is thrown from `write`. |
| .parse - strict:false error | `ndjson > skips invalid lines with invalid: skip` | |
| .stringify | `ndjson > encodes a value as a line` | |
| .stringify circular | `ndjson > fails on a circular value` | Deliberate difference: ndjson writes `"[Circular ~]"` through json-stringify-safe, which changes the data. `EncoderStream` fails with `TypeError`, as `JSON.stringify` does. |

## stream-json

`tests/web/*` repeat the `tests/node/*` cases through web stream wrappers, with "(web)" in the name, and each maps to the row of the same node test.

| Upstream test | Covered by | Notes |
| --- | --- | --- |
| stringer: json streaming objects, json streaming primitives | `stream-json jsonl > encodes several values read back from lines` | |
| jsonl parser: len=1, 2, 3, 5, 10, len=5 quant=3, len=10 quant=7 | `stream-json jsonl > decodes <n> lines from <size>-character chunks` | |
| jsonl parser: file | `ndjson > decodes the ndjson fixture` | Upstream reads a gzipped file with `node:fs`. |
| jsonl stringer: single, multiple | `stream-json jsonl > encodes one value…`, `encodes several values…` | |
| jsonl stringer: default separator | `stream-json jsonl > separates values with \n` | |
| jsonl stringer: custom separator | skipped | NDJSON lines end in `\n`. |
| jsonl parser: invalid JSON at end, in middle | `stream-json jsonl > fails on an invalid last line`, `fails on an invalid line in the middle, naming the line` | |
| jsonl parser: skip errors | `stream-json jsonl > skips invalid lines in the middle and at the end` | |
| jsonl parser: replace errors with null, transform errors, forward raw value on error | skipped | `invalid` takes only `'error'` and `'skip'`. To recover lines yourself, split with `Lines.DecoderStream` from @portable/lines and call `JSON.parse`. |

## Known upstream issues

| Issue | Test |
| --- | --- |
| ndjson #6: a `null` line ends the stream, because Node object streams treat `null` as the end. | `known upstream issues > emits a null line instead of ending the stream (ndjson #6)` |
| ndjson reports a whitespace-only line as invalid. | `known upstream issues > skips whitespace-only lines, which ndjson reports as invalid` |
| ndjson ends lines with `os.EOL`, so it writes `\r\n` on Windows. | `known upstream issues > ends lines with \n on every platform (ndjson uses os.EOL)` |

The oracle tests compare `DecoderStream` with `ndjson.parse()` on randomly chunked input, and `EncoderStream` with `ndjson.stringify()` on values without circular references. The encoder comparison is skipped on Windows because of the `os.EOL` issue above.
