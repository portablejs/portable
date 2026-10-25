# @portable/csv

Decodes and encodes CSV (RFC 4180), as functions and as `TransformStream`s. Runs in browsers, Cloudflare Workers, Deno, Bun and Node 24+.

Replaces [csv-parse](https://www.npmjs.com/package/csv-parse), [csv-stringify](https://www.npmjs.com/package/csv-stringify), [papaparse](https://www.npmjs.com/package/papaparse) and [fast-csv](https://www.npmjs.com/package/fast-csv).

```sh
npm install @portable/csv
```

```ts
import * as Csv from '@portable/csv';

Csv.decode('name,age\r\n"Smith, J",42\r\n'); // [['name', 'age'], ['Smith, J', '42']]
Csv.decode('name,age\nAda,36\n', { header: true }); // [{ name: 'Ada', age: '36' }]

Csv.encode([{ name: 'Ada', note: 'said "hi"' }], { header: true });
// 'name,note\r\nAda,"said ""hi"""\r\n'
```

Streams read a `fetch` body and write a `Response` body:

```ts
const response = await fetch('https://example.com/users.csv');
const rows = response.body!.pipeThrough(new Csv.DecoderStream({ header: true }));
for await (const row of Streams.toAsyncIterable(rows)) {
  console.log(row.email);
}

const body = Streams.fromIterable(users)
  .pipeThrough(new Csv.EncoderStream({ header: ['id', 'email'] }));
return new Response(body, { headers: { 'content-type': 'text/csv' } });
```

## Decoding

`Csv.decode(input, options)` takes a `string` or a `Uint8Array` and returns every row. `new Csv.DecoderStream(options)` is a `TransformStream<Uint8Array | string, Row>` that emits one row per chunk, and gives the same rows however the input is split.

A row is a `string[]`, or a `Record<string, string>` when `header` is set. Values are never converted: `02134` stays `'02134'`. When `header` is an array of names written in the call, TypeScript types the row by those names, and with `relaxColumnCount: true` each key is optional, because the missing keys of a short row are left out:

```ts
const rows = Csv.decode(text, { header: ['id', 'email'] });
// rows: Record<'id' | 'email', string>[], so a misspelled column such as rows[0].emial fails to type-check
```

- A quoted field may contain the delimiter, doubled quotes (`""`) and line breaks.
- CRLF, LF and CR each end a row. A final line break is optional and adds no row.
- A leading byte order mark is dropped.
- Spaces and tabs between a closing quote and the next delimiter are skipped.
- A quote that doesn't start a field is read as text, so `5" pipe` decodes to `5" pipe`.

| Option | Default | Description |
| --- | --- | --- |
| `delimiter` | `','` | Field separator, one character. `'\t'` reads TSV. |
| `quote` | `'"'` | Quote character, one character, or `false` to read quotes as text (TSV without quoting). |
| `header` | `false` | `true` reads column names from the first row. An array gives the names for input with no header row. A repeated name throws `InvalidInputError`. |
| `relaxColumnCount` | `false` | Accept rows whose field count differs from the first row's or the header's. With `header`, the missing keys of a short row are left out and the extra fields of a long row are dropped. |
| `skipEmpty` | `true` | Drop lines with no characters. `false` reads each as a row with one empty field. |
| `maxLength` | `Infinity` | Longest row, in UTF-16 code units of input text, not counting the line break. The stream fails as soon as an unfinished row is longer than the limit, so a missing closing quote can't make it buffer the whole input. |
| `encoding` | `'utf-8'` | `TextDecoder` label for byte input, such as `'windows-1252'` or `'utf-16le'`. |
| `signal` | | `DecoderStream` only. Aborting errors the stream with `signal.reason` and cancels the source piped into it. |

`decode` throws these errors, and `DecoderStream` fails with them. Their messages give the row number, counting from 1 and including skipped empty lines.

| Error | When |
| --- | --- |
| `Csv.InvalidInputError` | Text after a closing quote, a row with a different field count (unless `relaxColumnCount`), or a repeated header name. |
| `Csv.TruncatedError` | The input ends inside a quoted field. |
| `Csv.MaxLengthError` | A row is longer than `maxLength`, which the error stores. |

A bad option, such as a two-character delimiter or a negative `maxLength`, throws `RangeError`.

## Encoding

`Csv.encode(rows, options)` returns the CSV text. `new Csv.EncoderStream(options)` is a `TransformStream<Row, Uint8Array>` that emits one chunk of UTF-8 bytes per row. The first chunk also contains the header row.

A row is an array of values or an object keyed by column name. Strings are written unchanged. Numbers, booleans and bigints are written with `String()`, a `Date` with `toISOString()`, and `null` and `undefined` as an empty field. Any other value throws `InvalidInputError`. So does an invalid `Date`, and so does an object row after array rows, unless `header` is an array.

A field is quoted only when it contains the delimiter, the quote, CR or LF, and a row of one empty field is written as `""` so it isn't read back as an empty line. Every row ends with `newline`, including the last.

| Option | Default | Description |
| --- | --- | --- |
| `delimiter` | `','` | Field separator, one character. |
| `quote` | `'"'` | Quote character, or `false` to never quote. With `false`, a field that needs quotes throws `InvalidInputError`. |
| `newline` | `'\r\n'` | `'\r\n'` or `'\n'`. |
| `header` | `false` | `true` writes the first object row's keys as a header row. With an array, those names are written as the header row, even with no rows, and each object row's values are read by those names, in that order. Without a header, object rows are written in the first row's key order. A key missing from a row is written as an empty field. |
| `bom` | `false` | Start with a byte order mark, which Excel needs to read UTF-8. |
| `escapeFormulas` | `false` | Prefix fields starting with `=`, `+`, `-`, `@`, tab or CR with `'` and quote them, so spreadsheets don't run them as formulas ([CSV injection](https://owasp.org/www-community/attacks/CSV_Injection)). |
| `signal` | | `EncoderStream` only. Aborting errors the stream with `signal.reason` and cancels the source piped into it. |

## Why use this over csv-parse, papaparse and fast-csv

csv-parse, csv-stringify and fast-csv are Node streams, and papaparse's streaming reads Node streams, `File`s and URLs. `DecoderStream` and `EncoderStream` are `TransformStream`s, so they work on a `fetch` body and a `Response` in any JavaScript runtime, and the package has no dependencies outside `@portable/*`.

The benchmarks use 5,000 rows (500 kB) of quoted text, prices and dates.

<!-- bench:start -->
| Benchmark | Library | Ops/s | Relative | |
| --- | --- | ---: | --- | --- |
| Decode 5,000 rows from a string | **@portable/csv** | 401 |  | ████████████ |
|  | papaparse | 219 | 1.8× slower | ██████▌ |
|  | csv-parse or csv-stringify | 56.3 | 7.1× slower | █▋ |
|  | fast-csv | 25.0 | 16× slower | ▊ |
| Decode a 500 kB stream | **@portable/csv** | 312 |  | ████████████ |
|  | papaparse | 145 | 2.2× slower | █████▋ |
|  | csv-parse or csv-stringify | 47.5 | 6.6× slower | █▉ |
|  | fast-csv | 28.7 | 11× slower | █▏ |
| Encode 5,000 rows to a string | **@portable/csv** | 419 |  | ████████████ |
|  | papaparse | 141 | 3.0× slower | ████ |
|  | csv-parse or csv-stringify | 61.7 | 6.8× slower | █▊ |
|  | fast-csv | 61.3 | 6.8× slower | █▊ |
| Encode a stream of 5,000 rows | **@portable/csv** | 128 |  | ████████████ |
|  | fast-csv | 90.8 | 1.4× slower | ████████▌ |
|  | csv-parse or csv-stringify | 64.3 | 2.0× slower | ██████ |

Operations per second from `pnpm bench`, higher is better, in Node 24.22.0, on Intel(R) Xeon(R) Processor @ 2.10GHz (4 cores). Each benchmark lists only the libraries that can do the same work, fastest first. The relative speed compares each library with @portable/csv, and the bars are scaled to the fastest library.

| Library | Version | Minified and gzipped | Runtime dependencies | Node built-ins | TypeScript types |
| --- | --- | ---: | ---: | --- | --- |
| @portable/csv | – | 2.5 kB | 3 | none | included |
| csv-parse or csv-stringify | 7.0.3 | 10 kB | 1 | `Buffer` | included |
| papaparse | 5.7.0 | 7.0 kB | 0 | none | `@types/papaparse` |
| fast-csv | 5.0.8 | 6.9 kB | 1 | `Buffer`, `fs`, `stream`, `string_decoder`, `util` | included |

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
- With CRLF line breaks, a field that contains a lone LF is quoted. csv-stringify with `record_delimiter: 'windows'` leaves it bare, so readers split the row there.

Other differences to check when you switch:

- csv-stringify ends rows with `\n` by default, and `encode` and `EncoderStream` end them with `\r\n`. Pass `newline: '\n'` to keep csv-stringify's output.
- papaparse's `unparse` doesn't end the last row with a line break. `encode` ends every row with `newline`.
- papaparse reads empty lines as rows unless `skipEmptyLines` is set. `decode` skips them by default.
- papaparse with `header: true` accepts rows whose field count differs from the header's. `decode` throws `InvalidInputError` for them unless you pass `relaxColumnCount: true`.
- csv-parse's `cast`, papaparse's `dynamicTyping` and the `transform` options have no equivalent, because values are never converted. Map the rows instead, for example with `Streams.map` from `@portable/streams`.
- papaparse guesses the delimiter by default. Here the delimiter is `,` unless you pass `delimiter`.
- Comments, trimming, csv-parse's `from` and `to`, and papaparse's `preview` have no equivalent. Filter or map the rows, or leave the loop early, which cancels the stream.
- Delimiters longer than one character and escape characters other than `""` are not supported.
- csv-stringify's `quoted` and papaparse's `quotes` force quoting, which is not supported. Fields are quoted only when they need it.
- csv-stringify reads nested column paths such as `columns: ['a.b']`. Flatten the rows before you pass them to `encode`.
