# @portable/mime-stream

Splits a raw MIME message into a stream of header blocks, bodies and multipart structure, and writes it back out byte for byte. Use it to change a message on its way through, such as removing attachments or hashing bodies, without parsing the whole message into objects. Runs in browsers, Cloudflare Workers, Deno, Bun and Node 24+.

Replaces [mailsplit](https://www.npmjs.com/package/mailsplit) (now [@zone-eu/mailsplit](https://www.npmjs.com/package/@zone-eu/mailsplit)). To parse a message into text, HTML and attachments, use [postal-mime](https://www.npmjs.com/package/postal-mime).

```sh
npm install @portable/mime-stream
```

```ts
import * as MimeStream from '@portable/mime-stream'

// Replace every PDF attachment with a note, and keep the rest of the message as it was.
const output = message
  .pipeThrough(new MimeStream.DecoderStream())
  .pipeThrough(
    new TransformStream<MimeStream.Chunk, MimeStream.EncoderStream.Input>({
      transform(chunk, controller) {
        if (chunk.part.contentType !== 'application/pdf') controller.enqueue(chunk)
        else if (chunk.type === 'headers')
          controller.enqueue('Content-Type: text/plain\r\n\r\nAttachment removed.')
      },
    }),
  )
  .pipeThrough(new MimeStream.EncoderStream())
```

`message` is a `ReadableStream<Uint8Array>`, such as `request.body` or `file.stream()`.

To read only the header block, for example to check a DKIM signature, use `splitHeaders`. It doesn't look for parts, so the body passes through untouched:

```ts
const { headers, body } = await MimeStream.splitHeaders(message)
// headers: the header block as received, with the empty line that ends it
// body: a ReadableStream of every byte after it
```

## API

| Export | Description |
| --- | --- |
| `new DecoderStream(options?)` | `TransformStream<Uint8Array, Chunk>`. Splits a message into chunks. Nothing is decoded: bodies are still base64 or quoted-printable. |
| `new EncoderStream()` | `TransformStream<Input, Uint8Array>`. Writes each chunk's `bytes`. It also takes a `Uint8Array`, or a string, which it writes as UTF-8. |
| `splitHeaders(stream, options?)` | Resolves to `{ headers, body }`: the root header block as a `Uint8Array` and the rest as a `ReadableStream<Uint8Array>`. If the input ends before an empty line, all of it is the header block. |
| `MaxHeaderBytesError` | Thrown when a header block is longer than `maxHeaderBytes`. Stores `maxHeaderBytes`. |
| `MaxBoundaryLineBytesError` | Thrown when a boundary line is longer than `maxBoundaryLineBytes`. Stores `maxBoundaryLineBytes`. |
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

| Option | Of | Default | Description |
| --- | --- | --- | --- |
| `embedded` | `DecoderStream` | `false` | Split the message inside a `message/rfc822` or `message/global` part into parts too, unless it is base64 or quoted-printable. Its root part's `parent` is the `message/rfc822` part. |
| `maxHeaderBytes` | both | `1048576` | Longest header block of a part, counted with the empty line that ends it. |
| `maxBoundaryLineBytes` | `DecoderStream` | `1000` | Longest boundary line, line break included. Only whitespace after the boundary makes a line this long. Other lines are never held in memory. |
| `maxParts` | `DecoderStream` | `1000` | Most parts in a message, the root and embedded messages included. |

## Why use this over mailsplit

mailsplit is a Node `Transform` stream with libmime, libqp and libbase64 as dependencies. `DecoderStream` is a `TransformStream` with one dependency, `@portable/mime-headers`, so it reads a `fetch` body or a Workers email in any runtime.

- Splitting and joining 1.5 MB of mail took 1.5 ms on Node 24, against 8.7 ms for mailsplit. `splitHeaders` reads the header block and passes on the body of the same message in 0.08 ms; mailsplit has no equivalent and took 8.7 ms with `ignoreEmbedded`.
- A part that has headers and no body, followed by a delimiter (`--B\r\nX-Only: headers\r\n--B`), is kept. mailsplit 5.4.23 drops its bytes, so its output is not the input.
- A delimiter followed by spaces or tabs is read as a delimiter, as RFC 2046 allows. mailsplit reads it as body text, so it sees different parts from mail clients.
- Header values are decoded as UTF-8 and the raw bytes are kept in the `headers` chunk. mailsplit returns Latin-1 strings, which turns UTF-8 addresses into mojibake (mailsplit #21).
- A part with no `Content-Type` is `text/plain`, as RFC 2045 says. mailsplit guesses a type from the file name.
- Chunks are plain objects. To change a header, enqueue new bytes for the `headers` chunk, for example from `MimeHeaders.fold`. There is no headers object to keep in sync.

## Migrating

| mailsplit | @portable/mime-stream |
| --- | --- |
| `stream.pipe(new Splitter())` | `stream.pipeThrough(new DecoderStream())` |
| `.pipe(new Joiner())` | `.pipeThrough(new EncoderStream())` |
| `{ ignoreEmbedded: true }` | the default |
| `{ defaultInlineEmbedded: true }` | `{ embedded: true }` |
| `{ maxHeadSize }` | `{ maxHeaderBytes }`, counted in bytes; mailsplit counts each line as at least 64 bytes |
| `{ maxChildNodes }` | `{ maxParts }` |
| `err.code === 'EMAXLEN'` | `instanceof MaxHeaderBytesError`, `MaxBoundaryLineBytesError` or `MaxPartsError` |
| `data.type === 'node'` | `chunk.type === 'headers'` |
| `data.type === 'body'` | `chunk.type === 'body'` |
| `data.type === 'data'` | `'preamble'`, `'delimiter'` or `'epilogue'` |
| `data.value` | `chunk.bytes` |
| `node.getHeaders()` | `chunk.bytes` of the `headers` chunk |
| `node.headers.get(key)`, `getFirst(key)` | `chunk.part.headers.filter(...)`, `find(...)` |
| `node.headers.add`, `update`, `remove` | Enqueue new header bytes in place of the chunk. |
| `node.contentType`, `node.encoding`, `node.multipart` | `part.contentType`, `part.encoding`, `part.boundary` |
| `node.charset`, `node.filename`, `node.disposition` | `MimeHeaders.parseValue` on the `Content-Type` or `Content-Disposition` field |
| `node.parentNode`, `node.root` | `part.parent`, `part.parent === undefined` |
| `node.getDecoder()`, `getEncoder()` | Pipe body chunks' bytes through `@portable/base64` or `@portable/quoted-printable`. |
| `Rewriter`, `Streamer` | A `TransformStream` that acts on the chunks of the parts you want, as in the example above. |
| `headers.mbox`, `headers.http` | The first line of the root `headers` chunk. It isn't a header field, so `part.headers` skips it. |

Other differences from mailsplit:

- A delimiter line may be followed by spaces or tabs, and an unchanged part that has headers and no body is written back out.
- `part.headers` skips a first line that starts with whitespace and a line with no valid field name, such as an mbox `From ` line. A bare CR doesn't end a line.
- `encoding` drops every comment, including an unclosed one: `base64 (x` is `base64`. mailsplit keeps the text when a comment isn't closed.
- A part made of headers only, or of nothing, between two delimiters is reported as a part. mailsplit reports nothing for it.
