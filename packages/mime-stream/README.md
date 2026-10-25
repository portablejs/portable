# @portable/mime-stream

Splits a raw MIME message into a stream of header blocks, bodies and multipart structure, and writes it back out byte for byte. Use it to change a message on its way through, such as removing attachments or hashing bodies, without parsing the whole message into objects. Runs in browsers, Cloudflare Workers, Deno, Bun and Node 24+.

Replaces [mailsplit](https://www.npmjs.com/package/mailsplit) (now [@zone-eu/mailsplit](https://www.npmjs.com/package/@zone-eu/mailsplit)). To parse a message into text, HTML and attachments, use [postal-mime](https://www.npmjs.com/package/postal-mime).

```sh
npm install @portable/mime-stream
```

```ts
import * as MimeStream from '@portable/mime-stream';

// Replace every PDF attachment with a note, and keep the rest of the message as it was.
const output = message
  .pipeThrough(new MimeStream.DecoderStream())
  .pipeThrough(
    new TransformStream<MimeStream.Chunk, MimeStream.EncoderStream.Input>({
      transform(chunk, controller) {
        if (chunk.part.contentType !== 'application/pdf') {
          controller.enqueue(chunk);
        } else if (chunk.type === 'headers') {
          controller.enqueue('Content-Type: text/plain\r\n\r\nAttachment removed.');
        }
      },
    }),
  )
  .pipeThrough(new MimeStream.EncoderStream());
```

`message` is a `ReadableStream<Uint8Array>`, such as `request.body` or `file.stream()`.

To read only the header block, for example to check a DKIM signature, use `splitHeaders`. It doesn't look for parts, so the body passes through untouched:

```ts
const { headers, body } = await MimeStream.splitHeaders(message);
// headers: the header block as received, with the empty line that ends it
// body: a ReadableStream of every byte after it
```

## API

| Export | Description |
| --- | --- |
| `new DecoderStream(options?)` | `TransformStream<Uint8Array, Chunk>`. Splits a message into chunks. Nothing is decoded: bodies are still base64 or quoted-printable. |
| `new EncoderStream(options?)` | `TransformStream<Input, Uint8Array>`. Writes each chunk's `bytes`. It also takes a `Uint8Array`, or a string, which it writes as UTF-8. |
| `splitHeaders(stream, options?)` | Resolves to `{ headers, body }`: the root header block as a `Uint8Array` and the rest as a `ReadableStream<Uint8Array>`. If the input ends before an empty line, all of it is the header block. |
| `MaxHeaderBytesError` | Thrown when a header block is longer than `maxHeaderBytes`. Stores `maxHeaderBytes`, and extends `Errors.MaxBytesError`, so `maxBytes` holds the same limit. |
| `MaxBoundaryLineBytesError` | Thrown when a boundary line is longer than `maxBoundaryLineBytes`. Stores `maxBoundaryLineBytes`, and extends `Errors.MaxBytesError`, so `maxBytes` holds the same limit. |
| `MaxPartsError` | Thrown when a message has more than `maxParts` parts. Stores `maxParts`. |

A `Chunk` is `{ type, part, bytes }`. Joining every chunk's `bytes` in order gives back the input.

| `type` | `bytes` | `part` |
| --- | --- | --- |
| `'headers'` | A header block, with the empty line that ends it. | The part the headers belong to. Every part starts with one. |
| `'body'` | Content of a part with no children. | That part. |
| `'preamble'` | Text before the first delimiter. | The multipart. |
| `'delimiter'` | A boundary line, with the line break before it and its own line break. | The multipart. |
| `'epilogue'` | Text after the close delimiter. | The multipart. |

A `Part` is a plain object, shared by every chunk of that part:

| Field | Description |
| --- | --- |
| `parent` | The multipart, or the `message/rfc822` part, that contains it. Missing on the root. |
| `headers` | The header fields, `{ name, value }[]` in order and unfolded, read as UTF-8. See `@portable/mime-headers` to decode values. |
| `contentType` | Lowercase media type without parameters. `text/plain` when missing or invalid, and `message/rfc822` inside `multipart/digest` (RFC 2046). |
| `encoding` | Lowercase `Content-Transfer-Encoding`, `7bit` when missing. |
| `boundary` | Set on a `multipart/*` part that has a boundary. Its children follow. |

Parts are split as RFC 2046 says. A delimiter is `--` and the boundary on a line of its own, optionally followed by `--` (the close delimiter) and spaces or tabs. The line break before a delimiter belongs to the delimiter, so a body never ends with it. Lines may end in CRLF or LF. A delimiter of an outer multipart also ends every multipart inside it, and a close delimiter in the preamble is preamble text. After the close delimiter, lines that look like delimiters of that multipart are epilogue text.

## Options

The size limits default to `Infinity`. Set `maxHeaderBytes`, `maxBoundaryLineBytes` and `maxParts` when you read mail from outside your program, because without them a message can make the decoder buffer a header block or boundary line of any size, or report any number of parts. `maxHeaderBytes: 1024 * 1024`, `maxBoundaryLineBytes: 1000` and `maxParts: 1000` are enough for real mail.

| Option | Of | Default | Description |
| --- | --- | --- | --- |
| `embedded` | `DecoderStream` | `false` | Split the message inside a `message/rfc822` or `message/global` part into parts too, unless it is base64 or quoted-printable. Its root part's `parent` is the `message/rfc822` part. |
| `maxHeaderBytes` | `DecoderStream`, `splitHeaders` | `Infinity` | Longest header block of a part, counted with the empty line that ends it. |
| `maxBoundaryLineBytes` | `DecoderStream` | `Infinity` | Longest boundary line, line break included. Only whitespace after the boundary makes a line this long. Other lines are never held in memory. |
| `maxParts` | `DecoderStream` | `Infinity` | Most parts in a message, the root and embedded messages included. |
| `signal` | all | | When it aborts, the streams fail with `signal.reason` and cancel their source. `splitHeaders` rejects with it while it reads the header block, and fails `body` with it after. |

## Types

| Type | Description |
| --- | --- |
| `MimeStream.Chunk` | A run of bytes from the message, with its `type` and the `part` it belongs to. |
| `MimeStream.Part` | One part of the message: the root, a part of a multipart, or the message inside a `message/rfc822` part. |
| `MimeStream.EncoderStream.Input` | What `EncoderStream` takes: a `Chunk` or any object with `bytes`, a `Uint8Array`, or a string. |

## Why use this over mailsplit

mailsplit is a Node `Transform` stream with libmime, libqp and libbase64 as dependencies. `DecoderStream` is a `TransformStream` with no dependencies outside `@portable/*`, so it reads a `fetch` body or a Workers email in any runtime.

- Splitting and joining 1.5 MB of mail took 1.3 ms on Node 24, against 7.9 ms for mailsplit. `splitHeaders` reads the header block and passes on the body of the same message in 0.06 ms. mailsplit has no equivalent, and with `ignoreEmbedded` it took 7.9 ms.
- A part that has headers and no body, followed by a delimiter (`--B\r\nX-Only: headers\r\n--B`), is kept. mailsplit 5.4.23 drops its bytes, so its output is not the input.
- A delimiter followed by spaces or tabs is read as a delimiter, as RFC 2046 allows. mailsplit reads it as body text, so it sees different parts from mail clients.
- Header values are decoded as UTF-8 and the raw bytes are kept in the `headers` chunk. mailsplit returns Latin-1 strings, which turns UTF-8 addresses into mojibake (mailsplit #21).
- A part with no `Content-Type` is `text/plain`, as RFC 2045 says. mailsplit guesses a type from the file name.
- Chunks are plain objects. To change a header, enqueue new bytes for the `headers` chunk, for example from `MimeHeaders.fold`. There is no headers object to keep in sync.
- mailsplit splits embedded messages unless `ignoreEmbedded` is set. `DecoderStream` splits them only with `embedded: true`.
- mailsplit's `maxHeadSize` defaults to 1 MiB and counts each line as at least 64 bytes. `maxHeaderBytes` counts bytes and defaults to no limit, so pass `maxHeaderBytes: 1024 * 1024` to keep mailsplit's limit.
- mailsplit's `maxChildNodes` defaults to 1000, and `maxParts` defaults to no limit, so pass `maxParts: 1000` to keep mailsplit's limit.
- mailsplit's limit errors have the `code` `'EMAXLEN'`. For an exceeded limit, `DecoderStream` throws `MaxHeaderBytesError`, `MaxBoundaryLineBytesError` or `MaxPartsError`.
- Unlike mailsplit's nodes, a part has no `charset`, `filename` or `disposition` field. Read them with `MimeHeaders.parseValue` from the `Content-Type` or `Content-Disposition` field.
- mailsplit's `headers.mbox` and `headers.http` have no equivalent. The mbox `From ` line or HTTP status line stays at the start of the root `headers` chunk, and `part.headers` leaves it out.
- `part.headers` leaves out a first line that starts with whitespace and a line with no valid field name. A bare CR doesn't end a line.
- Every comment is dropped from `encoding`, including an unclosed one, so `base64 (x` gives `base64`. mailsplit keeps the text when a comment isn't closed.
- An empty part between two delimiters is reported as a part. mailsplit reports nothing for it.

<!-- bench:start -->
<table>
<thead><tr><th align="left">Library</th><th align="right">Ops/s</th><th align="left">Relative</th><th></th></tr></thead>
<tbody>
<tr><th colspan="4" align="left">Split and join 1.5 MB of mail</th></tr>
<tr><td><code>TransformStream</code> copy</td><td align="right">13,600</td><td>18× faster</td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="160" height="12" alt="" /></td></tr>
<tr><td>@portable/mime-stream</td><td align="right">745</td><td></td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="9" height="12" alt="" /></td></tr>
<tr><td>mailsplit</td><td align="right">126</td><td>5.9× slower</td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="2" height="12" alt="" /></td></tr>
<tr><th colspan="4" align="left">Read the header block of 1.5 MB of mail</th></tr>
<tr><td>@portable/mime-stream</td><td align="right">17,000</td><td></td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="160" height="12" alt="" /></td></tr>
<tr><td>mailsplit</td><td align="right">126</td><td>130× slower</td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="2" height="12" alt="" /></td></tr>
</tbody>
</table>

Operations per second from `pnpm bench`, higher is better, in Node 24.22.0, on Intel(R) Xeon(R) Processor @ 2.10GHz (4 cores). Each benchmark lists only the libraries that can do the same work, fastest first. The relative speed compares each library with @portable/mime-stream, and the bars are scaled to the fastest library.

| Library | Version | Minified and gzipped | Runtime dependencies | Node built-ins | TypeScript types |
| --- | --- | ---: | ---: | --- | --- |
| @portable/mime-stream | – | 5.5 kB | 5 | none | included |
| mailsplit | 5.4.23 | 263 kB | 6 | `buffer`, `path`, `stream`, `string_decoder` | included |
| `TransformStream` copy | – | built in | – | none | – |

Sizes cover the imports in the usage example, or the equivalent imports of each library, bundled for the browser by `scripts/bundle-size.ts`. Runtime dependencies count every package installed with the published package. A library that uses Node built-ins needs polyfills in a browser and the `nodejs_compat` flag in Cloudflare Workers.
<!-- bench:end -->
