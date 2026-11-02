# @portable/mime-stream

Splits a raw MIME message into a stream of header blocks, bodies, and multipart delimiters, and writes it back out byte for byte. Use it to change a message as it streams through, e.g. to remove attachments or hash bodies, without parsing the whole message. Runs in browsers, Cloudflare Workers, Node 24+, Bun, and Deno.

Replaces [mailsplit](https://www.npmjs.com/package/mailsplit) (now [@zone-eu/mailsplit](https://www.npmjs.com/package/@zone-eu/mailsplit)). To parse a message into text, HTML, and attachments, use [postal-mime](https://www.npmjs.com/package/postal-mime).

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

To read only the header block, e.g. to check a DKIM signature, use `splitHeaders`. The body passes through untouched:

```ts
const { headers, body } = await MimeStream.splitHeaders(message);
// headers: the header block as received, with the empty line that ends it
// body: a ReadableStream of every byte after it
```

## API

| Export | Description |
| --- | --- |
| `new DecoderStream(options?)` | `TransformStream<Uint8Array, Chunk>`. Splits a message into chunks without decoding bodies, which stay base64 or quoted-printable. Input with no empty line is all one root `headers` chunk. |
| `new EncoderStream(options?)` | `TransformStream<Input, Uint8Array>`. Writes each chunk's `bytes`, or a `Uint8Array`, or a string as UTF-8. It checks nothing, so a new `headers` chunk must end with an empty line, and new body text must not contain an enclosing multipart's delimiter. |
| `splitHeaders(stream, options?)` | Resolves to `{ headers, body }`: the root header block as a `Uint8Array` and the rest as a `ReadableStream<Uint8Array>`. Input with no empty line is all header block. |
| `MaxHeaderBytesError` | Thrown when a header block is longer than `maxHeaderBytes`. Stores `maxHeaderBytes`. Extends `Errors.MaxBytesError`, so `maxBytes` holds the same limit. |
| `MaxBoundaryLineBytesError` | Thrown when a boundary line is longer than `maxBoundaryLineBytes`. Stores `maxBoundaryLineBytes`. Extends `Errors.MaxBytesError`, so `maxBytes` holds the same limit. |
| `MaxPartsError` | Thrown when a message has more than `maxParts` parts. Stores `maxParts`. |

A `Chunk` is `{ type, part, bytes }`. Joining every chunk's `bytes` in order gives back the input.

| `type` | `bytes` | `part` |
| --- | --- | --- |
| `'headers'` | A header block, with the empty line that ends it. | The part the headers belong to. Every part starts with one. |
| `'body'` | Content of a part with no children. | That part. |
| `'preamble'` | Text before the first delimiter. | The multipart. |
| `'delimiter'` | A boundary line, with the line break before it and its own line break. | The multipart. |
| `'epilogue'` | Text after the close delimiter. | The multipart. |

A `body`, `preamble`, or `epilogue` can arrive as several chunks, split where the input was split. `headers` and `delimiter` are always one chunk each.

No chunk marks the end of a part. A `body`, `preamble`, or `epilogue` ends at the next `delimiter` chunk or the end of the stream.

A `Part` is a plain object, shared by every chunk of that part:

| Field | Description |
| --- | --- |
| `parent` | The multipart, or the `message/rfc822` part, that contains it. Missing on the root. |
| `headers` | The header fields as `{ name, value }[]`, in order, unfolded, and read as UTF-8. See [@portable/mime-headers](https://portablejs.com/packages/mime-headers) to decode values. |
| `contentType` | Lowercase media type without parameters, from the first `Content-Type` field. `text/plain` when missing or invalid, or `message/rfc822` inside `multipart/digest` (RFC 2046). |
| `encoding` | Lowercase `Content-Transfer-Encoding` from the first such field, or `7bit` when missing. |
| `boundary` | Set on a `multipart/*` part that has a boundary. Its children follow. |

Parts are split as RFC 2046 says: a delimiter is `--` and the boundary on its own line, optionally followed by `--` (the close delimiter) and spaces or tabs. Lines may end in CRLF or LF.

The line break before a delimiter belongs to the delimiter, so a body never ends with it.

An outer multipart's delimiter also ends every multipart inside it. A close delimiter in the preamble is preamble text, and delimiter lines after the close delimiter are epilogue text.

## Options

The size limits default to `Infinity`. For untrusted mail, set `maxHeaderBytes: 1024 * 1024`, `maxBoundaryLineBytes: 1000`, and `maxParts: 1000`, which are enough for real mail. Otherwise a message can make the decoder buffer any amount or report any number of parts.

| Option | Of | Default | Description |
| --- | --- | --- | --- |
| `embedded` | `DecoderStream` | `false` | Also split the message inside a `message/rfc822` or `message/global` part when its `Content-Transfer-Encoding` is `7bit`, `8bit`, `binary`, or missing. The inner root's `parent` is that part. |
| `maxHeaderBytes` | `DecoderStream`, `splitHeaders` | `Infinity` | Longest header block of a part, counted with the empty line that ends it. |
| `maxBoundaryLineBytes` | `DecoderStream` | `Infinity` | Longest boundary line, line break included. Only trailing whitespace can make a boundary line this long, and other lines are never buffered. |
| `maxParts` | `DecoderStream` | `Infinity` | Most parts in a message, counting the root and each embedded message. |
| `signal` | all | | Aborting errors the streams with `signal.reason` and cancels their source. `splitHeaders` rejects with it while reading the header block, and errors `body` with it after. |

## Types

| Type | Description |
| --- | --- |
| `MimeStream.Chunk` | A run of bytes from the message, with its `type` and the `part` it belongs to. |
| `MimeStream.Part` | One part of the message: the root, a part of a multipart, or the message inside a `message/rfc822` part. |
| `MimeStream.EncoderStream.Input` | What `EncoderStream` takes: a `Chunk` or any object with `bytes`, a `Uint8Array`, or a string. |

## Why use this over mailsplit

mailsplit is a Node `Transform` stream that depends on libmime, libqp, and libbase64. `DecoderStream` is a `TransformStream` with no dependencies outside `@portable/*`, so it reads a `fetch` body or a Workers email in any runtime.

- Splitting and joining 1.5 MB of mail took 1.3 ms in Node 24, against 7.9 ms for mailsplit. `splitHeaders` took 0.06 ms on the same message.
- A part with headers and no body before a delimiter (`--B\r\nX-Only: headers\r\n--B`) is kept. mailsplit 5.4.23 drops its bytes.
- A delimiter followed by spaces or tabs is a delimiter (RFC 2046). mailsplit reads it as body text, so it sees different parts from mail clients.
- Header values are decoded as UTF-8, and the `headers` chunk keeps the raw bytes. mailsplit returns Latin-1 strings, which garbles UTF-8 addresses (mailsplit #21).
- A part with no `Content-Type` is `text/plain` (RFC 2045). mailsplit guesses a type from the file name.
- Chunks are plain objects. To change a header, enqueue new bytes for the `headers` chunk, e.g. from `MimeHeaders.fold`.
- Embedded messages are split only with `embedded: true`. mailsplit splits them unless `ignoreEmbedded` is set.
- `maxHeaderBytes` counts bytes and has no default limit. mailsplit's `maxHeadSize` defaults to 1 MiB and counts each line as at least 64 bytes.
- `maxParts` has no default limit. mailsplit's `maxChildNodes` defaults to 1000.
- An exceeded limit throws `MaxHeaderBytesError`, `MaxBoundaryLineBytesError`, or `MaxPartsError`, not an error with `code` `'EMAXLEN'`.
- A part has no `charset`, `filename`, or `disposition` field. Read them from `Content-Type` or `Content-Disposition` with `MimeHeaders.parseValue`.
- There is no `headers.mbox` or `headers.http`. An mbox `From ` line or HTTP status line stays at the start of the root `headers` chunk and is left out of `part.headers`.
- `part.headers` leaves out a first line that starts with whitespace and any line without a valid field name. A bare CR doesn't end a line.
- Every comment is dropped from `encoding`, even an unclosed one, so `base64 (x` gives `base64`. mailsplit keeps an unclosed comment.
- An empty part between two delimiters is reported as a part. mailsplit skips it.

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
