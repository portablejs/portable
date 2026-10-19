# @portable/csv

Decodes and encodes CSV (RFC 4180), as functions and as `TransformStream`s. Runs in browsers, Cloudflare Workers, Deno, Bun and Node 24+.

Replaces [csv-parse](https://www.npmjs.com/package/csv-parse) and [csv-stringify](https://www.npmjs.com/package/csv-stringify), [papaparse](https://www.npmjs.com/package/papaparse) and [fast-csv](https://www.npmjs.com/package/fast-csv).

```sh
npm install @portable/csv
```

```ts
import * as Csv from '@portable/csv'

Csv.decode('name,age\r\n"Smith, J",42\r\n') // [['name', 'age'], ['Smith, J', '42']]
Csv.decode('name,age\nAda,36\n', { header: true }) // [{ name: 'Ada', age: '36' }]

Csv.encode([{ name: 'Ada', note: 'said "hi"' }], { header: true })
// 'name,note\r\nAda,"said ""hi"""\r\n'
```

Streams read a `fetch` body and write a `Response` body:

```ts
const response = await fetch('https://example.com/users.csv')
const reader = response.body!.pipeThrough(new Csv.DecoderStream({ header: true })).getReader()
for (let r = await reader.read(); !r.done; r = await reader.read()) console.log(r.value.email)

const body = Streams.fromIterable(users)
  .pipeThrough(new Csv.EncoderStream({ header: ['id', 'email'] }))
  .pipeThrough(new TextEncoderStream())
return new Response(body, { headers: { 'content-type': 'text/csv' } })
```

## Decoding

`Csv.decode(input, options)` takes a `string` or a `Uint8Array` and returns every row. `new Csv.DecoderStream(options)` is a `TransformStream<Uint8Array | string, Row>` that emits one row per chunk, and gives the same rows however the input is split.

A row is a `string[]`, or a `Record<string, string>` when `header` is set. Values are never converted: `02134` stays `'02134'`.

- A quoted field may hold the delimiter, doubled quotes (`""`) and line breaks.
- CRLF, LF and CR each end a row. A final line break is optional and adds no row.
- A leading byte order mark is dropped.
- Spaces and tabs between a closing quote and the next delimiter are skipped.
- A quote that doesn't start a field is text: `5" pipe` reads as `5" pipe`.

| Option | Default | Description |
| --- | --- | --- |
| `delimiter` | `','` | Field separator, one character. `'\t'` reads TSV. |
| `quote` | `'"'` | Quote character, one character, or `false` to read quotes as text (TSV without quoting). |
| `header` | `false` | `true` reads column names from the first row. An array gives the names for input with no header row. A repeated name throws `InvalidInputError`. |
| `relaxColumnCount` | `false` | Accept rows whose field count differs from the first row's or the header's. With `header`, a short row leaves the missing keys out and a long row's extra fields are dropped. |
| `skipEmpty` | `true` | Drop lines with no characters. `false` reads each as a row with one empty field. |
| `maxLength` | `Infinity` | Longest row, in UTF-16 code units of input text, not counting the line break. The stream fails as soon as an unfinished row passes it, so a missing closing quote can't buffer the whole input. |
| `encoding` | `'utf-8'` | `TextDecoder` label for byte input, such as `'windows-1252'` or `'utf-16le'`. |

Errors are thrown by `decode` and fail the stream. Messages name the row, counting from 1 and including skipped empty lines.

| Error | When |
| --- | --- |
| `Csv.InvalidInputError` | Text after a closing quote, a row with a different field count (unless `relaxColumnCount`), or a repeated header name. |
| `Csv.TruncatedError` | The input ends inside a quoted field. |
| `Csv.MaxLengthError` | A row is longer than `maxLength`, which the error stores. |

A bad option, such as a two-character delimiter, throws `TypeError`.

## Encoding

`Csv.encode(rows, options)` returns the CSV text. `new Csv.EncoderStream(options)` is a `TransformStream<Row, string>` that emits one chunk per row, the first one with the header row. Pipe it through `TextEncoderStream` for bytes.

A row is an array of values or an object keyed by column name. Strings are written as they are, numbers, booleans and bigints with `String()`, a `Date` with `toISOString()`, and `null` and `undefined` as an empty field. Anything else throws `TypeError`.

A field is quoted only when it holds the delimiter, the quote, CR or LF, and a row of one empty field is written as `""` so it isn't read back as an empty line. Every row ends with `newline`, including the last.

| Option | Default | Description |
| --- | --- | --- |
| `delimiter` | `','` | Field separator, one character. |
| `quote` | `'"'` | Quote character, or `false` to never quote, which throws `InvalidInputError` for a field that needs quotes. |
| `newline` | `'\r\n'` | `'\r\n'` or `'\n'`. |
| `header` | `false` | `true` writes the first object row's keys as a header row. An array writes those names and reads object rows by them, in that order, and is written even with no rows. Without a header, object rows are written in the first row's key order. A key missing from a row is written as an empty field. |
| `bom` | `false` | Start with a byte order mark, which Excel needs to read UTF-8. |
| `escapeFormulas` | `false` | Prefix fields starting with `=`, `+`, `-`, `@`, tab or CR with `'` and quote them, so spreadsheets don't run them as formulas ([CSV injection](https://owasp.org/www-community/attacks/CSV_Injection)). |

## Why use this over csv-parse, papaparse and fast-csv

csv-parse, csv-stringify and fast-csv are Node streams, and papaparse's streaming reads Node streams, `File`s and URLs. `DecoderStream` and `EncoderStream` are `TransformStream`s, so they work on a `fetch` body and a `Response` in any JavaScript runtime, and the package has no dependencies.

The benchmarks use 5,000 rows (500 kB) of quoted text, prices and dates.

<!-- bench:start -->
| | @portable/csv | csv-parse or csv-stringify | papaparse | fast-csv |
| --- | ---: | ---: | ---: | ---: |
| Decode 5,000 rows from a string | 401 | 56.3 | 219 | 25.0 |
| Decode a 500 kB stream | 312 | 47.5 | 145 | 28.7 |
| Encode 5,000 rows to a string | 419 | 61.7 | 141 | 61.3 |
| Encode a stream of 5,000 rows | 128 | 64.3 | – | 90.8 |

Operations per second from `pnpm bench`, higher is better, in Node 24.22.0, on Intel(R) Xeon(R) Processor @ 2.10GHz (4 cores). A dash means the library has no equivalent.

| | @portable/csv | csv-parse or csv-stringify | papaparse | fast-csv |
| --- | --- | --- | --- | --- |
| Minified and gzipped | 2.1 kB | 10 kB | 7.0 kB | 6.9 kB |
| Runtime dependencies | 0 | 1 | 0 | 1 |
| Node built-ins used | none | `Buffer` | none | `Buffer`, `fs`, `stream`, `string_decoder`, `util` |
| TypeScript types | included | included | `@types/papaparse` | included |
| Version compared | – | 7.0.3 | 5.7.0 | 5.0.8 |

Sizes cover the imports in the usage example, or the equivalent imports of each library, bundled for the browser by `scripts/bundle-size.ts`. Runtime dependencies count every package installed with the published package. A library that uses Node built-ins needs polyfills in a browser and the `nodejs_compat` flag in Cloudflare Workers.
<!-- bench:end -->

It also avoids these traps, each with a test in `test/issues.conformance.ts`:

- A `__proto__` column is kept. papaparse drops it.
- A final line break adds no row. papaparse returns an extra `['']`.
- A repeated header name throws. papaparse renames it to `a_1`, and csv-parse keeps only the last value.
- `"a" b,c` throws. papaparse reads it as one field, `a" b,c`.
- The BOM is dropped from the first column name. csv-parse keeps it unless `bom: true`.
- A blank line is skipped. csv-parse throws "Invalid Record Length" unless `skip_empty_lines: true`.
- `true` and `false` are written as `true` and `false`, and a `Date` as ISO 8601. csv-stringify writes `1`, an empty field and milliseconds.
- A lone LF in a field is quoted with CRLF line breaks. csv-stringify with `record_delimiter: 'windows'` leaves it bare, so readers split the row there.

## Migrating

| csv-parse / csv-stringify / papaparse / fast-csv | @portable/csv |
| --- | --- |
| `parse(text)` (`csv-parse/sync`) | `Csv.decode(text)` |
| `parse(text, { columns: true })` | `Csv.decode(text, { header: true })` |
| `parse(text, { columns: ['a', 'b'] })` | `Csv.decode(text, { header: ['a', 'b'] })` |
| `parse({ delimiter: '\t', relax_column_count: true })` | `new Csv.DecoderStream({ delimiter: '\t', relaxColumnCount: true })` |
| `parse({ bom: true, skip_empty_lines: true })` | `new Csv.DecoderStream()` |
| `parse({ max_record_size: n })` | `new Csv.DecoderStream({ maxLength: n })` |
| `parse({ quote: false })` | `new Csv.DecoderStream({ quote: false })` |
| `stringify(rows)` (`csv-stringify/sync`) | `Csv.encode(rows, { newline: '\n' })` |
| `stringify(rows, { header: true, columns: ['a', 'b'] })` | `Csv.encode(rows, { header: ['a', 'b'] })` |
| `stringify({ bom: true, escape_formulas: true })` | `new Csv.EncoderStream({ bom: true, escapeFormulas: true })` |
| `Papa.parse(text, { skipEmptyLines: true })` | `Csv.decode(text)` |
| `Papa.parse(text, { header: true })` | `Csv.decode(text, { header: true, relaxColumnCount: true })` |
| `Papa.parse(file, { step })` | `file.stream().pipeThrough(new Csv.DecoderStream())`, read row by row |
| `Papa.unparse(rows)` | `Csv.encode(rows)`, which also ends the last row with `\r\n` |
| `Papa.unparse(rows, { escapeFormulae: true })` | `Csv.encode(rows, { escapeFormulas: true })` |
| fast-csv `parse({ headers: true })` | `new Csv.DecoderStream({ header: true })` |
| fast-csv `format({ headers: true })` | `new Csv.EncoderStream({ header: true })` |

Options with no equivalent, and what to do instead:

- **Type conversion** (`cast`, `dynamicTyping`, `transform`): map the rows, for example with `Streams.map` from `@portable/streams`.
- **Delimiter guessing** (papaparse's default): pass `delimiter`.
- **Comments, trimming, `from`/`to`, `preview`**: filter or map rows, or cancel the reader to stop early.
- **Multi-character delimiters and escape characters other than `""`**: not supported.
- **Forced quoting** (`quoted`, `quotes`): not supported; fields are quoted only when needed.
- **Nested column paths** (csv-stringify `columns: ['a.b']`): flatten rows first.
