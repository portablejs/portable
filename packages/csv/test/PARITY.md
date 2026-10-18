# Test parity

Upstream suites:

- [csv-parse 7.0.3 `test/`](https://github.com/adaltas/node-csv/tree/master/packages/csv-parse/test), every `.ts` and `.js` file.
- [csv-stringify 6.9.0 `test/`](https://github.com/adaltas/node-csv/tree/master/packages/csv-stringify/test), by file.
- [papaparse 5.7.0 `tests/test-cases.js` and `tests/node-tests.js`](https://github.com/mholt/PapaParse/tree/master/tests).
- [csv-spectrum 2.0.0](https://github.com/max-mapper/csv-spectrum), which csv-parse's `spectrum.js` runs. Its CSV and JSON files are copied into `fixtures/spectrum/` (BSD-2-Clause, Max Ogden). `location_coordinates.json` is corrected to the phone number its CSV holds (csv-spectrum #20, the reason csv-parse skips it).

fast-csv is compared in the benchmark only. Its tests cover the same RFC 4180 cases through a Node stream API.

Test names below are `describe > test` in the conformance files: `decode.conformance.ts` (csv-parse, RFC 4180), `papaparse.conformance.ts`, `encode.conformance.ts` (csv-stringify, papaparse unparse, `EncoderStream`), `DecoderStream.conformance.ts` and `issues.conformance.ts`. Every decode case runs through `decode` and through `DecoderStream` fed whole, one character at a time, one byte at a time and in random text and byte chunks (`decodeAll` in `utils.ts`).

Options we leave out, and why, so the rows below can point here:

- **Type conversion** (csv-parse `cast`, `cast_date`; papaparse `dynamicTyping`, `transform`): values stay strings. Map rows with `Streams.map` or `Array.prototype.map`.
- **Row hooks and selection** (csv-parse `on_record`, `on_skip`, `objname`, `from`, `to`, `from_line`, `to_line`, `skip_records_with_error`, `skip_records_with_empty_values`; papaparse `preview`, `step`, `chunk`, `skipFirstNLines`, pause and resume): filter or stop reading the stream instead. Cancelling the reader stops the parse.
- **Trimming** (csv-parse `trim`, `ltrim`, `rtrim`; papaparse `skipEmptyLines: 'greedy'`): RFC 4180 keeps spaces. Trim in a map.
- **Comments** (csv-parse `comment`, `comment_no_infix`; papaparse `comments`): not part of RFC 4180. Filter rows instead.
- **Escape characters other than a doubled quote** (csv-parse `escape`; papaparse `escapeChar`): RFC 4180 escapes a quote by doubling it.
- **Multi-character delimiters, record delimiters and quotes, and delimiter guessing** (csv-parse `delimiter` arrays, `record_delimiter`, `delimiter_auto`, `quote: '$$'`; papaparse `delimitersToGuess`, `newline`): `delimiter` and `quote` are one character, and CRLF, LF and CR always end a row.
- **Header renaming and grouping** (csv-parse `columns` functions and `false` entries, `group_columns_by_name`, `ignore_last_delimiters`; papaparse `transformHeader`): rename keys in a map, or pass `header` as an array.
- **Parse metadata** (csv-parse `info`, `raw`, `info.*`; papaparse `meta`, `errors`, cursor positions): errors are thrown, and rows are plain arrays or objects.
- **Node stream API** (events, `pipe`, `destroy`, `finished`, callbacks, `ResizableBuffer`, option normalization and snake_case options): `DecoderStream` is a `TransformStream`.
- **Browser and network inputs** (papaparse `download`, `worker`, `File`, `beforeFirstChunk`): pass `fetch(url).body` or `file.stream()` to `DecoderStream`.

## csv-parse

| Upstream test | Covered by | Notes |
| --- | --- | --- |
| api.arguments.js, api.arguments.ts (16) | `csv-parse > decodes a string`, `decodes bytes`; `DecoderStream` tests | Argument-count overloads of the Node API. `decode` takes input and options; `DecoderStream` takes options. |
| api.assert_error.ts (9) | skipped | Tests the suite's own assertion helper. |
| api.error.ts (4) | skipped | Tests `CsvError` codes and context fields. We throw `InvalidInputError`, `TruncatedError` and `MaxLengthError`. |
| api.info.ts (4) | skipped | Parse metadata. |
| api.stream.destroy.ts (3) | `DecoderStream > cancelling the output cancels the source` | |
| api.stream.events.ts (7) | `csv-parse > fails the stream when the source fails`, `quote > throws InvalidInputError for text after a closing quote` | Node stream events. Errors fail the stream once. |
| api.stream.finished.ts (3) | `csv-parse > decodes generated rows piped from a stream`, `fails the stream when the source fails` | |
| api.stream.iterator.ts (2) | `DecoderStream > cancelling the output cancels the source` | Stopping early is cancelling the reader. |
| api.stream.pipe.ts: piping in and reading out, piping in and callback out | `csv-parse > decodes generated rows piped from a stream` | |
| api.stream.pipe.ts: catch source error | `csv-parse > fails the stream when the source fails` | |
| api.stream.pipe.ts: handle empty string | `RFC 4180 > emits nothing for empty input` | |
| api.stream.write.ts: string randomly splited | `csv-parse > gives the same rows for any split of the input` | |
| api.stream.write.ts: throw error if not writable | skipped | Writing after close is rejected by the platform's `WritableStream`. |
| api.stream.write.ts: support multi-bytes utf8 encoded characters | `csv-parse > decodes a multi-byte character written one byte at a time` | |
| api.sync.ts: take a string / buffer / Uint8Array | `csv-parse > decodes a string`, `decodes bytes` | |
| api.sync.ts: `columns` option with and without generic | `header > reads column names from the first row`, `DecoderStream > types rows as objects when header is set` | |
| api.sync.ts: `columns` and `on_record`, `objname`, `to_line` | skipped | Row hooks and selection. |
| api.sync.ts: catch errors, catch err in last line while flushing | `relaxColumnCount > throws InvalidInputError by default when a row has a different field count` | |
| api.types.sync.ts, api.types.ts (66) | `DecoderStream > types rows as objects when header is set` | Type-level tests of csv-parse's option and info types. `pnpm check:types` checks ours. |
| api.web_stream.js, api.web_stream.ts (4) | `DecoderStream` tests, `csv-parse > fails the stream when the source fails` | |
| info.bytes.ts, info.bytes_records.ts, info.comment_lines.js, info.empty_lines.js, info.invalid_field_length.js, info.records.js (23) | skipped | Parse metadata. |
| info.lines.ts: count lines, count no line, count empty lines, should count sparse empty lines | skipped | Parse metadata. |
| info.lines.ts: should display correct line number when … (4) | `quote > names the row of the error`, `skipEmpty > counts skipped lines in row numbers` | We report the row, which equals the line when no quoted field holds a line break. The opening-quote case is not an error here. |
| option.bom.js: validate | skipped | No `bom` option: a leading BOM is always dropped. |
| option.bom.ts: preserve bom if not defined, preserve BOM if false | `bom > drops a leading byte order mark` | Deliberate difference: csv-parse keeps the BOM by default. |
| option.bom.ts: with column option with bom `true` / `false` | `bom > drops the byte order mark from the first column name` | |
| option.bom.ts: throw parsing error if quote follow bom | `bom > reads a quoted field after the byte order mark` | Deliberate difference: csv-parse throws when the BOM is kept. |
| option.bom.ts: handle BOM with utf8 (default), preserve data if BOM is true | `bom > drops a leading byte order mark`, `bom > keeps a byte order mark that is not at the start` | |
| option.bom.ts: handle BOM even if no enough data in the first package | `bom > drops a byte order mark written one byte at a time` | |
| option.bom.ts: preserve data if no enough data to detect BOM | `bom > keeps input that only starts like a byte order mark` | |
| option.bom.ts: options instance is updated and not re-created (#460) | skipped | `from_line`. |
| option.cast.js, option.cast.ts, option.cast_date.js, option.cast_date.ts (24) | `header > keeps values as strings` | Type conversion. |
| option.columns.js (4) | skipped | Validation of `columns` functions and `false` entries. |
| option.columns.ts: skip columns with false value, skips column names defined as undefined / false / null and last, illustrate bug with undefined values, last column value ignore when `null` | skipped | Header renaming. |
| option.columns.ts: dont mutate options | `header > does not change the header array` | |
| option.columns.ts: duplicate column names with true, with array, lines with empty column names | `header > throws InvalidInputError when the header repeats a name` | Deliberate difference: csv-parse keeps the last value. |
| option.columns.ts: read from first row if true | `header > reads column names from the first row` | |
| option.columns.ts: disabled if false | `header > emits arrays when header is false` | |
| option.columns.ts: header detection honors skip_empty_lines | `header > skips empty lines before the header row` | |
| option.columns.ts: header detection honors skip_records_with_empty_values | skipped | Row selection. |
| option.columns.ts: dont cast numbers (#477) | `header > keeps values as strings` | |
| option.columns.ts: enforced by user if array | `header > uses the given names for every row when header is an array` | |
| option.columns.ts: validate options column length on first line / last line, context column is null … (2) | `header > throws InvalidInputError when a row has fewer fields than the header` | |
| option.columns.ts: takes first line as argument, catch thrown errors | skipped | Header renaming. |
| option.columns.ts: prototype replacement still reachable via columns path (#496) | `header > stores a __proto__ column as an own property` | |
| option.comment.js, option.comment.ts, option.comment_no_infix.js, option.comment_no_infix.ts (15) | skipped | Comments. |
| option.delimiter.js: validation; option.delimiter.ts: validation | `delimiter > rejects a delimiter that is empty, longer than one character, a line break or the quote` | |
| option.delimiter.ts: default to comma, using default comma | `delimiter > defaults to a comma` | |
| option.delimiter.ts: using tab | `delimiter > splits on a tab` | |
| option.delimiter.ts: is compatible with buffer size, empty array create a single field, multiple chars …, using array of … (8) | skipped | Multi-character and multiple delimiters. |
| option.delimiter_auto.ts (9), utils.delimiter_discover.js (4) | skipped | Delimiter guessing. |
| option.encoding.js: integer throw invalid encoding; option.encoding.ts: boolean true / false, null return buffer | skipped | `encoding` is a `TextDecoder` label, and output is always text. An unknown label throws `RangeError` from `TextDecoder`. |
| option.encoding.ts: with delimiter, with escape equals quote | `encoding > decodes UTF-16LE bytes` | |
| option.encoding.ts: utf16le auto detected, … with quote, … with delimiter | `encoding > drops a UTF-16LE byte order mark`, `delimiter > splits on any one character` | We decode UTF-16 when `encoding` says so; we don't detect it from the BOM. |
| option.encoding.ts: utf16le auto detected with escape, with record_delimiter | skipped | Escape characters, record delimiters. |
| option.escape.js, option.escape.ts (14) | `quote > reads doubled quotes` | Escape characters: only the doubled quote. |
| option.from.js, option.from.ts, option.from_line.js, option.from_line.ts, option.to.js, option.to.ts, option.to_line.js, option.to_line.ts (44) | skipped | Row selection. The quoted-line cases in them are covered by `quote > reads line breaks inside quotes`. |
| option.group_columns_by_name.js, option.group_columns_by_name.ts (4) | skipped | Header grouping. |
| option.ignore_last_delimiters.js, option.ignore_last_delimiters.ts (7) | skipped | Header renaming. |
| option.info.js, option.info.ts (7), option.raw.js, option.raw.ts (6) | skipped | Parse metadata. |
| option.ltrim.js, option.ltrim.ts, option.rtrim.js, option.rtrim.ts, option.trim.js, option.trim.ts (45) | `RFC 4180 > keeps spaces in unquoted fields`, `papaparse > Parse Tests > Quoted fields with spaces after closing quote` | Trimming. Spaces after a closing quote are skipped, as rtrim and papaparse do. |
| option.max_record_size.js, option.max_record_size.ts: validation | skipped | `maxLength` takes any number; `Infinity` is the default. |
| option.max_record_size.ts: field exceed limit | `maxLength > throws MaxLengthError for a row longer than maxLength` | `maxLength` bounds the row, not one field. |
| option.objname.js, option.objname.ts (14) | skipped | Row hooks. The prototype cases (#479) are covered by `header > stores a __proto__ column as an own property`. |
| option.on_record.js, option.on_record.ts, option.on_skip.js, option.on_skip.ts (14) | skipped | Row hooks. |
| option.quote.ts: is compatible with buffer size, with multiple chars | skipped | Multi-character quotes. |
| option.quote.ts: default, normalize, with default | `quote > reads quoted and unquoted fields` | |
| option.quote.ts: with fields containing delimiters | `quote > reads fields containing delimiters` | |
| option.quote.ts: empty value | `quote > reads empty quoted values` | |
| option.quote.ts: values containing quotes …, only containing quotes … | `quote > reads doubled quotes` | |
| option.quote.ts: line breaks inside quotes | `quote > reads line breaks inside quotes` | |
| option.quote.ts: disabled if empty, if null, if false | `quote > reads quotes as text when quote is false` | `quote: ''` throws `TypeError`; `false` disables quoting. |
| option.quote.ts: with columns | `quote > reads quoted fields with header` | |
| option.quote.ts: when unclosed | `quote > throws TruncatedError when a quoted field is not closed` | |
| option.quote.ts: when followed by a character | `quote > throws InvalidInputError for text after a closing quote` | |
| option.quote.ts: no throw followed by a delimiter, by a record delimiter | `quote > accepts a delimiter or line break after a closing quote` | |
| option.quote.ts: no throw followed by a comment | skipped | Comments. |
| option.quote.ts: no throw followed by a trimable character | `papaparse > Parse Tests > Quoted fields with spaces after closing quote` | |
| option.quote.ts: Invalid opening quotes with indexed columns, with named columns | `quote > reads a quote inside an unquoted field as text` | Deliberate difference: a quote that doesn't start a field is text, as with csv-parse's `relax_quotes` and papaparse. |
| option.record_delimiter.ts: accepted types, non accepted types, as a string, as an array, details (8) | skipped | Record delimiters. |
| option.record_delimiter.ts: auto: No record | `RFC 4180 > emits nothing for empty input` | |
| option.record_delimiter.ts: auto: handle chunks in autodiscovery, write aggressively, ensure autodiscovery support chunck between lines | `line breaks > handles a line break split across chunks` | |
| option.record_delimiter.ts: auto: Test line ends with field delimiter and without record delimiter | `line breaks > reads a trailing delimiter as a last empty field` | |
| option.record_delimiter.ts: auto: skip default record delimiters when quoted | `line breaks > keeps line breaks inside quotes when written one character at a time` | |
| option.record_delimiter.ts: auto: with skip empty lines | `skipEmpty > skips empty lines by default` | |
| option.record_delimiter.ts: auto: support utf8 / utf16le, with and without bom, windows / mac os 9 / unix line endings (8) | `line breaks > reads CRLF / CR / LF line breaks from UTF-8 and UTF-16 bytes written one byte at a time` | |
| option.relax_column_count.js, option.relax_column_count.ts: validation | skipped | Option validation. |
| option.relax_column_count.ts: throw error by default, emit single error … | `relaxColumnCount > throws InvalidInputError by default when a row has a different field count` | |
| option.relax_column_count.ts: dont throw error if true, relax_column_count_more and _less (4) | `relaxColumnCount > accepts rows of any length when set` | One option for both directions. |
| option.relax_column_count.ts: with columns bigger than records | `relaxColumnCount > leaves out missing columns of a short row` | |
| option.relax_column_count.ts: with columns smaller than records | `relaxColumnCount > drops the extra fields of a long row` | |
| option.relax_column_count.ts: with columns and from | skipped | Row selection. |
| option.relax_column_count.ts: with on_record (2) | skipped | Row hooks. |
| option.relax_column_count.ts: with skip_records_with_error, dont skip records | `relaxColumnCount > reads a header row followed by a longer row` | |
| option.relax_quotes.js, option.relax_quotes.ts: validation | skipped | No option: quotes inside unquoted fields are always text. |
| option.relax_quotes.ts: true / false with invalid quotes in the middle, true / false with invalid quotes on the right | `quote > reads a quote inside an unquoted field as text` | |
| option.relax_quotes.ts: true / false with invalid quotes on the left, with two invalid quotes on the left | `quote > throws InvalidInputError for text after a closing quote` | A field that starts with a quote is quoted, so text after its closing quote is an error. |
| option.skip_empty_lines.js, option.skip_empty_lines.ts: validation | skipped | Option validation. |
| option.skip_empty_lines.ts: dont skip by default | `skipEmpty > reads an empty line as one empty field when false` | Deliberate difference: we skip by default, because csv-parse's default throws on a blank line in a file with more than one column. |
| option.skip_empty_lines.ts: skip, skip respect parser.read | `skipEmpty > skips empty lines by default` | |
| option.skip_empty_lines.ts: quoted fields are not interpreted as empty | `skipEmpty > reads a quoted empty field as a row` | |
| option.skip_empty_lines.ts: used conjointly with trim | `skipEmpty > reads a line of whitespace as a row` | Trimming. |
| option.skip_records_with_empty_values.js, .ts (6), option.skip_records_with_error.js, .ts (9) | skipped | Row selection. Errors always fail the parse. |
| options.js, options.ts (3) | skipped | snake_case and camelCase option normalization. |
| samples.js | skipped | Runs csv-parse's example scripts. |
| spectrum.js | `RFC 4180 > decodes csv-spectrum <name>` | All twelve files, including the two csv-parse skips. |
| utils.ResizableBuffer.js (12) | skipped | Internal buffer class. |

## csv-stringify

| Upstream test | Covered by | Notes |
| --- | --- | --- |
| api.callback.js, api.js, api.pipe.js, api.write.js: arrays, objects with column options, accepts full write API | `csv-stringify > encodes arrays`, `encodes objects with a header array`, `EncoderStream` tests | Node stream and callback API. |
| api.write.js: throw error if not writable | skipped | Writing after close is rejected by the platform's `WritableStream`. |
| api.write.js: write invalid record null / true | `csv-stringify > fails the stream for a value it cannot encode` | |
| api.write.js: input array / object immutable (3) | `csv-stringify > does not change its input` | |
| api.sync.js (4) | `csv-stringify > encodes arrays`, `encodes objects with a header array`, `csv-stringify > throws TypeError for a value it cannot encode` | |
| api.types.sync.ts, api.types.ts (22), types.coffee | skipped | Type-level tests; `pnpm check:types` checks ours. |
| api.web_stream.js | `EncoderStream` tests | |
| option.bom.js, option.bom.ts (8) | `csv-stringify > bom > starts the output with a byte order mark when set` | |
| option.cast.js, option.cast.ts, option.cast.types.ts (29) | `csv-stringify > writes values with String() and null and undefined as empty fields`, `writes a Date as ISO 8601` | No `cast` option. Map values before encoding. |
| option.columns.js, option.columns.ts (12) | `csv-stringify > encodes objects with a header array`, `papaparse > Unparse Tests > Column option used to manually specify keys` | Nested key paths (`a.b`) and column objects are not supported; flatten rows first. |
| option.delimiter.js, option.delimiter.ts (8) | `csv-stringify > delimiter > …` | Multi-character delimiters are rejected. |
| option.eof.ts (2) | `RFC 4180 > ends every row with CRLF` | Every row ends with `newline`. |
| option.escape.js, option.escape.ts (8) | `csv-stringify > quote > quotes with a custom character and doubles it inside fields` | Escape characters: only the doubled quote. |
| option.escape_formulas.js, option.escape_formulas.ts (5) | `csv-stringify > escapeFormulas > …` | Unicode look-alike signs are not escaped, matching papaparse. |
| option.header.js, option.header.ts (13) | `csv-stringify > header > …` | Nested columns are not supported. |
| option.header_as_comment.ts (4) | skipped | Comments. |
| option.quote.js, option.quote.ts (14) | `RFC 4180 > quotes only fields that hold the delimiter, a quote or a line break`, `csv-stringify > quote > …` | |
| option.quote_record_delimiter.ts (9) | `known upstream issues > a lone LF or CR in a field is quoted with CRLF line breaks …` | A field with CR or LF is always quoted. |
| option.quoted.ts, option.quoted_empty.ts, option.quoted_match.ts, option.quoted_string.ts (21) | skipped | No forced quoting; only fields that need quotes get them, plus the one-empty-field row. |
| option.record_delimiter.js, option.record_delimiter.ts (10) | `csv-stringify > newline > …` | Only `'\r\n'` and `'\n'`. |
| options.js | skipped | Option normalization. |
| samples.js | skipped | Example scripts. |
| types.js: should map date to getTime, true boolean value to 1, object to its json representation | `known upstream issues > booleans are written as 'true' and 'false' …`, `… a Date is written as ISO 8601 …`, `csv-stringify > throws TypeError for a value it cannot encode` | Deliberate differences. |

## papaparse

`papaparse.conformance.ts` and `encode.conformance.ts` use papaparse's descriptions as test names, so a case with the same name covers the upstream case. Cases not listed here have a test of the same name.

### Core Parser Tests

| Upstream test | Covered by | Notes |
| --- | --- | --- |
| Quoted field has no closing quote | same name | Throws `TruncatedError`; papaparse returns the rest of the input as one field with a `MissingQuotes` error. |
| Quoted field has invalid trailing quote … (4) | same names | Throw `InvalidInputError`; papaparse reports `InvalidQuotes` and keeps going. |
| Input is just empty fields | same name | Needs `relaxColumnCount`, since the rows have 3 and 4 fields. |
| One column input with empty fields | same name | With `skipEmpty: false`. The final line break doesn't add a row (see known issues). |
| Commented line … , Two comment lines …, Three comment lines …, Entire file is comment lines, Comment with non-default character, Bad comments value specified, Multi-character comment string, Input with only a commented line, … and blank line after (11) | skipped | Comments. |
| Fast mode, basic | `Core Parser Tests > Two rows` | No fast mode. |
| Fast mode with comments, with preview | skipped | Comments, row selection. |
| Fast mode with blank line at end | `known upstream issues > a final line break does not add an empty row` | |
| Simple duplicated header names, Duplicated header names with headerTransform, Duplicated header names existing column, Duplicate header names with __proto__ field | `Core Parser Tests > Duplicated header names` | Deliberate difference: throws `InvalidInputError` where papaparse renames to `A_1`. |

### Parse Tests

| Upstream test | Covered by | Notes |
| --- | --- | --- |
| Mixed slash n and slash r should choose first as precident | same name | Deliberate difference: CR ends a row wherever it appears, so `f\rg` is two rows. papaparse uses only the first line break it sees. |
| Row with too few fields, Row with too many fields | same names | Throw by default; with `relaxColumnCount`, a short row leaves keys out and extra fields are dropped. papaparse keeps extras in `__parsed_extra`. |
| Header rows are transformed when transformHeader function is provided, transformHeader accepts and optional index attribute | skipped | Header renaming. |
| Bad delimiter (\n), Multi-character delimiter | same names | Throw `TypeError`. |
| Multi-character delimiter (length 2) with quoted field, Callback delimiter | skipped | Multi-character delimiters. |
| Dynamic typing … (10), Custom transform … (3) | `known upstream issues > values are never converted …`; `Dynamic typing doesn't convert other types` | Type conversion. |
| Blank line at beginning, Blank line in middle, Blank lines at end | same names | Skipped by default. |
| Empty input string, Input is just the delimiter (2 empty fields), Input is just a string (a single field) | `Core Parser Tests` cases of the same names | No `UndetectableDelimiter` warning. |
| Preview … (7) | skipped | Row selection. |
| Empty lines | same name | With `skipEmpty: false`. |
| Skip empty lines, with empty input | `Core Parser Tests > Empty input string` | |
| Lines with comments are not used when guessing the delimiter … (2) | skipped | Comments. |
| Pipe delimiter is guessed correctly when mixed with comas, … choose avgFildCount max one | skipped | Delimiter guessing. |
| Pipe delimiter is guessed correctly when … enclosed in quotes … (2), Delimiter is guessed correctly when a quoted field holds newlines … | same names | With `delimiter: ';'` given. |
| Custom escape character in the middle, at the end, not used for escaping | skipped | Escape characters. |
| Header row with preceding comment | skipped | Comments. |
| Parsing with skipEmptyLines set to 'greedy' | skipped | Trimming. |
| Parsing with skipEmptyLines set to 'greedy' with quotes and delimiters as content | same name | Its rows hold content, so the default `skipEmpty` gives the same result. |
| Skip First N number of lines … (5) | skipped | Row selection. |
| Issue 1024: renamedHeaders returned for simple duplicate headers | `Core Parser Tests > Duplicated header names` | |
| downloadTimeout throws …, downloadTimeout is coerced … | skipped | Network input. |

### Parse Async Tests

| Upstream test | Covered by | Notes |
| --- | --- | --- |
| Simple worker | same name | |
| Simple download, Simple download + worker, Simple file, Simple file + worker, File with a few regular and lots of empty lines (+ worker) | skipped | Browser and network inputs. |

### Custom Tests

| Upstream test | Covered by | Notes |
| --- | --- | --- |
| Pause and resume works (#636), … for chunks with NetworkStreamer / FileStreamer / StringStreamer | `DecoderStream > gives the same rows for random byte chunks` | Back-pressure is the stream's. |
| Duplicate values in a data row are not renamed after resume (#998), Empty trailing fields stay empty after resume (#985), Data is correctly parsed with steps when there are empty values, Quoted line breaks near chunk boundaries are handled, Step functions can abort parsing | same names | |
| Complete is called …, Step is called …, Data is correctly parsed with steps (5), Step exposes …, Chunk … (6), Step functions can pause / resume / abort workers, Complete is called after aborting, beforeFirstChunk … (2), downloadTimeout … (2), transformHeader is called exactly once …, Data is correctly parsed with chunks and duplicated headers | `DecoderStream` tests | papaparse's callback API. Reading the stream is the step; cancelling is the abort. |
| Should correctly guess custom delimiter …, Should still correctly guess default delimiters … | skipped | Delimiter guessing. |
| When parsing synchronously inside a web-worker … (browser test) | skipped | Worker plumbing. |

### Unparse Tests

| Upstream test | Covered by | Notes |
| --- | --- | --- |
| All cases | same names, with a final `\r\n` | Deliberate difference: every row ends with a line break, so an `EncoderStream` chunk is always whole rows. |
| Specifying column names only (no data), Empty input with columns | `csv-stringify > header > writes the header array even with no rows` | |
| Specifying data only (no field names), improperly / properly, Column option used to manually specify keys with input type object | `A simple row`, `Column option used to manually specify keys` | No `{ fields, data }` input; pass `header` instead. |
| Custom delimiter (semicolon), (tab) | `csv-stringify > delimiter > separates fields with the delimiter` | |
| Custom delimiter (Multi-character) (2), Bad delimiter (\n), Custom line ending (\r), Custom, but strange, line ending ($) | `csv-stringify > delimiter > rejects …`, `newline > rejects line breaks other than '\r\n' and '\n'` | |
| Custom line ending (\n) | `csv-stringify > newline > writes '\n' line breaks` | |
| Force quotes … (6) | skipped | No forced quoting. |
| Empty input, Empty input with columns and disabled header | `RFC 4180 > writes nothing for no rows` | |
| Custom quote character (single quote), Custom quoteChar escapes and quotes embedded quoteChar | `csv-stringify > quote > quotes with a custom character and doubles it inside fields` | |
| Date objects are exported in its ISO representation, … with an expanded year | `csv-stringify > writes a Date as ISO 8601` | |
| Invalid Date objects are exported as an empty field | `Invalid Date objects throw RangeError` | Deliberate difference: an invalid `Date` throws, as `toISOString()` does. |
| Returns without empty rows when skipEmptyLines is true / 'greedy' (4), Skips single-cell rows …, Does not skip single-cell rows containing 0 | skipped | No row filtering on encode. `RFC 4180 > writes a row of one empty field as ""` covers what a null cell becomes. |
| Returns empty rows … when skipEmptyLines is false (3) | `Returns empty rows when empty rows are passed` | |
| Use different escapeChar, Custom quoteChar with custom escapeChar … | skipped | Escape characters. |
| test defeault escapeChar | `Data with quotes` | |
| Escape formulae, Don't escape formulae by default, with tab and carriage-return | same names, `csv-stringify > escapeFormulas > is off by default` | |
| Escape formulae with forced quotes, with single-quote quoteChar and escapeChar (and forced quotes) (5) | skipped | Forced quoting and escape characters. |

### node-tests.js

| Upstream test | Covered by | Notes |
| --- | --- | --- |
| synchronously parsed CSV should be correctly parsed | `csv-parse > decodes a string` | |
| asynchronously parsed CSV, asynchronously parsed streaming CSV, piped streaming CSV should be correctly parsed | `DecoderStream > gives the same rows for random byte chunks` | |
| piped streaming CSV should be correctly parsed when header is true | `Custom Tests > Data is correctly parsed with steps when there are empty values` | |
| reports the correct row number on FieldMismatch errors | `relaxColumnCount > throws InvalidInputError by default when a row has a different field count` | The error names the row. papaparse reports and continues; we throw unless `relaxColumnCount` is set. |
| Pause and resume works (#636), should support pausing and resuming on same tick / asynchronously when streaming | `DecoderStream > gives the same rows for random byte chunks` | Back-pressure is the stream's. |
| handles errors in beforeFirstChunk, in chunk, in step | `csv-parse > fails the stream when the source fails` | Callback API. An error in a later stage fails the pipe. |
| handles utf-8 BOM encoded files | `bom > drops a leading byte order mark` | |

## Known upstream issues

Found by running each library on crafted input (`csv.oracle.test.ts` and a probe script) and by reading their tests. Each has a test in `issues.conformance.ts`.

| Issue | Test |
| --- | --- |
| papaparse drops a `__proto__` column, because `row['__proto__'] = value` sets the prototype. | `a __proto__ column is kept` |
| papaparse returns an extra `['']` row for a final line break. | `a final line break does not add an empty row` |
| papaparse renames a repeated header (`a_1`) and logs a console warning; csv-parse keeps the last value. Either way a column is renamed or lost. | `a repeated header name throws` |
| papaparse `dynamicTyping` turns `02134` into `2134` and large integers into lossy numbers. | `values are never converted, so leading zeros stay` |
| papaparse reports `UndetectableDelimiter` for one-column input. | `one-column input needs no delimiter guess` |
| papaparse reads `"a" b,c` as one field `a" b,c`, silently merging fields. | `text after a closing quote throws` |
| csv-parse keeps the BOM by default, so the first column name is `﻿key`. | `the byte order mark is dropped from the first column name` |
| csv-parse throws "Invalid Record Length" on a blank line by default. | `an empty line is skipped` |
| csv-stringify writes `true` as `1` and `false` as an empty field. | `booleans are written as 'true' and 'false'` |
| csv-stringify writes a `Date` as milliseconds since 1970. | `a Date is written as ISO 8601` |
| csv-stringify with `record_delimiter: 'windows'` leaves a lone LF in a field unquoted, so readers split the row there. | `a lone LF or CR in a field is quoted with CRLF line breaks` |
| papaparse and csv-stringify write a row of one empty field as an empty line, which is dropped when read back with empty-line skipping. | `a row of one empty field survives a round trip` |

## Oracle tests

`csv.oracle.test.ts` compares `decode` and `DecoderStream` (random byte chunks) with csv-parse (`bom`, `relax_quotes` and `skip_empty_lines` set, which match RFC 4180 plus our defaults) and with papaparse (`skipEmptyLines`), on random rows built from delimiters, quotes, CR, LF, CRLF, spaces, tabs and multi-byte characters, plus csv-spectrum. It compares `encode` with csv-stringify (`\n` line breaks) and papaparse `unparse` (plus the final `\r\n`). Inputs where they disagree with RFC 4180 are left out: papaparse quotes fields with leading or trailing whitespace, and csv-stringify's custom record delimiters leave a lone LF bare.

## Benchmarks

csv-parse's and papaparse's suites have no benchmarks in their test directories. `csv.bench.ts` compares one-shot and streaming decode and encode of 5,000 order rows with csv-parse, csv-stringify, papaparse and fast-csv, and fails if any is more than 25% faster.
