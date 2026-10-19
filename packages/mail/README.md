# @portable/mail

Builds a raw RFC 5322 email message, with text and HTML alternatives, attachments, inline images and custom headers, as a `ReadableStream<Uint8Array>`. It doesn't send mail: pass the result to an SMTP client, an email API that takes raw MIME, or write it to an `.eml` file. Runs in browsers, Cloudflare Workers, Deno, Bun and Node 24+.

Replaces nodemailer's `MailComposer` (`nodemailer/lib/mail-composer`) and the `MimeNode` it builds on.

```sh
npm install @portable/mail
```

```ts
import * as Mail from '@portable/mail'

const message: Mail.Message = {
  from: 'Mari Tamm <mari@example.com>',
  to: ['jaan@example.com', { name: 'Jõgeva Ants', address: 'ants@example.com' }],
  subject: 'Aruanne',
  text: 'Tere! Aruanne on lisatud.',
  html: '<p>Tere! Aruanne on lisatud.</p><img src="cid:logo">',
  attachments: [
    { content: logoBytes, contentType: 'image/png', cid: 'logo' },
    { content: (await fetch(reportUrl)).body!, filename: 'aruanne.pdf', contentType: 'application/pdf' },
  ],
}

const raw = Mail.encode(message) // ReadableStream<Uint8Array>
const { from, to } = Mail.envelope(message) // for MAIL FROM and RCPT TO

await fetch('https://api.example.com/send-raw', { method: 'POST', body: raw, duplex: 'half' })
```

The report is read from the network while the caller reads the message, so a large attachment is never held in memory. Cancelling `raw` cancels the response body.

## API

| Export | Description |
| --- | --- |
| `encode(message, options?)` | Returns the message as a `ReadableStream<Uint8Array>` with CRLF line breaks. Throws `InvalidInputError` or `TypeError` before anything is read if the message can't be written. |
| `envelope(message)` | Returns `{ from, to }`: the first `From` address (else `Sender`) and every `To`, `Cc` and `Bcc` address once, with group members in place of groups. |
| `InvalidInputError` | Thrown for an address, header name, content type or file name that can't be written. |
| `Message`, `Attachment`, `Part`, `Content`, `Addresses`, `Mailbox`, `HeaderFields`, `TransferEncoding`, `Envelope` | Types. |

### Message

| Field | Type | Description |
| --- | --- | --- |
| `from`, `sender`, `to`, `cc`, `replyTo` | `Addresses` | An address list as text (`'Mari <mari@example.com>, b@example.com'`), a `{ name?, address }`, or a list of either. Groups are allowed in text. |
| `bcc` | `Addresses` | Read by `envelope`. `encode` writes the header only with `keepBcc`. |
| `subject` | `string` | Encoded as RFC 2047 words when it isn't printable ASCII. |
| `messageId`, `inReplyTo` | `string` | Angle brackets are added if missing. The default Message-ID is random, at the `From` domain. |
| `references` | `string \| string[]` | Message IDs separated by whitespace. |
| `date` | `Date \| string` | Defaults to now. A `Date` is written as `Tue, 2 Jan 2024 03:04:05 +0000`. |
| `text`, `amp`, `html` | `Content` | The bodies, written as `multipart/alternative` in that order. |
| `alternatives` | `Part[]` | More alternatives after the HTML, each `{ content, contentType, headers?, transferEncoding? }`. |
| `attachments` | `Attachment[]` | Each `{ content, filename?, contentType?, cid?, disposition?, headers?, transferEncoding? }`. |
| `headers` | `HeaderFields` | Extra header fields, written first, in order. A list value writes one field per value. |

`Content` is a `string`, `Uint8Array`, `Blob` (including `File`) or `ReadableStream<Uint8Array>`. A `File` gives the attachment its file name and a `Blob` its content type.

Attachments with a `cid` go into `multipart/related` beside the HTML, and other attachments into `multipart/mixed`. An image with a `cid` defaults to `Content-Disposition: inline`, everything else to `attachment`.

Text bodies are `7bit` when every line is ASCII and at most 76 characters, otherwise `quoted-printable` for mostly Latin text and `base64` for the rest. A body from a stream or `Blob` can't be scanned first, so it is `quoted-printable`. Attachments are `base64`, except `message/*`, which is `8bit`. Line breaks in `7bit`, `8bit` and text `quoted-printable` bodies become CRLF.

### Options

| Option | Default | Description |
| --- | --- | --- |
| `boundary` | `'=_'`, 16 random hex digits, `'_'` | The start of every multipart boundary. Each one appends its number, counted from 1 in the order the parts are written. Up to 60 characters from RFC 2046's `bchars`; anything else throws `RangeError`. |
| `charset` | UTF-8 | A `CharsetEncoder` (`{ name, encode(text) }`) for encoded words and string text bodies, for mail that has to use another charset. `@portable/charset` provides them. |
| `keepBcc` | `false` | Write the `Bcc` header, for a transport such as sendmail that reads recipients from it. |

Set `boundary`, `messageId` and `date` to get the same bytes on every run, for example in tests.

```ts
import * as Charset from '@portable/charset'
import { iso2022Jp } from '@portable/charset/iso-2022-jp'

Mail.encode(
  { from: 'テスト <a@example.com>', subject: 'こんにちは', text: 'こんにちは' },
  { charset: { name: 'ISO-2022-JP', encode: (text) => Charset.encode(text, iso2022Jp) } },
)
```

## Why use this over nodemailer

nodemailer's composer needs Node streams, `Buffer`, `fs`, `http` and `crypto`, so it doesn't run in browsers or Workers. This package uses only web APIs and has no dependencies outside `@portable/*`. With the same boundary, Message-ID and Date, its output matches `MailComposer` byte for byte on most messages: 254 of 300 generated messages in the oracle test were identical, and the other 46 differed only where libqp breaks a quoted-printable line.

- In the benchmarks on Node 24, `encode` was 2.5× faster than `MailComposer` on 100 text and HTML messages and 1.2× faster on a 4 MB attachment read from a stream. With a 1 MB attachment in memory the difference was within the noise. There is no native API that composes MIME to compare with.
- Line breaks in `7bit` and `8bit` bodies are written as CRLF. Without its `newline` option, nodemailer writes a bare LF as is, which is how SMTP smuggling starts.
- An invalid address, such as `a,b@good.com`, `a@evil.com@good.com` or a bare `root`, throws `InvalidInputError`. nodemailer quotes it or keeps it and sends the message.
- `encode` throws for a recipient that is only a comment, such as `(a@evil.com)`, instead of dropping it.
- Text that looks like an encoded word (`=?x?q?y?=`) is encoded, so a reader sees the subject the sender wrote. Quotes in a subject stay readable, but nodemailer 10.1.7 encodes them.
- A `Uint8Array` text body is scanned like a string and can be `7bit`. nodemailer always encodes a `Buffer` body.
- `Message` has no `path` or `href` field, so untrusted input can't make the composer read a file or fetch a URL. Pass `(await fetch(url)).body` or a `File` instead.
- Cancelling the output cancels every content stream that hasn't been read, and a failing stream errors the output and cancels the rest.

<!-- bench:start -->
| | @portable/mail | nodemailer |
| --- | ---: | ---: |
| Encode 100 text and HTML messages | 89.6 | 30.1 |
| Encode a message with a 1 MB attachment | 218 | 337 |
| Encode a message with a 4 MB attachment from a stream | 66.6 | 77.0 |

Operations per second from `pnpm bench`, higher is better, in Node 24.22.0, on Intel(R) Xeon(R) Processor @ 2.10GHz (4 cores). A dash means the library has no equivalent.

| | @portable/mail | nodemailer |
| --- | --- | --- |
| Minified and gzipped | 13 kB | 38 kB |
| Runtime dependencies | 4 | 0 |
| Node built-ins used | none | `Buffer`, `crypto`, `dns`, `fs`, `http`, `https`, `net`, `os`, `path`, `stream`, `url`, `util`, `zlib` |
| TypeScript types | included | none |
| Version compared | – | 10.1.2 |

Sizes cover the imports in the usage example, or the equivalent imports of each library, bundled for the browser by `scripts/bundle-size.ts`. Runtime dependencies count every package installed with the published package. A library that uses Node built-ins needs polyfills in a browser and the `nodejs_compat` flag in Cloudflare Workers.
<!-- bench:end -->

## Migrating

| nodemailer | @portable/mail |
| --- | --- |
| `new MailComposer(mail).compile().build()` | `await new Response(Mail.encode(message)).bytes()` |
| `compile().createReadStream()` | `Mail.encode(message)` |
| `compile().getEnvelope()` | `Mail.envelope(message)` |
| `from`, `to`, `cc`, `bcc`, `replyTo`, `sender`, `inReplyTo`, `references`, `subject`, `messageId`, `date`, `text`, `html`, `amp`, `alternatives`, `attachments`, `headers` | The same names. |
| attachment `content: Buffer \| string \| Readable` | `content: Uint8Array \| string \| Blob \| ReadableStream`. In Node, `Readable.toWeb(stream)`. |
| attachment or alternative `path`, `href` | `content: (await fetch(url)).body` or `content: await fs.openAsBlob(path)` with `filename`. |
| `contentType` detected from the file name | Pass `contentType`. `@remix-run/mime` maps file names to types. |
| `contentTransferEncoding` | `transferEncoding` |
| `contentDisposition` | `disposition` |
| `encoding: 'base64'` on string content | Decode it first and pass the bytes. |
| `icalEvent` | An `alternatives` entry with `contentType: 'text/calendar; charset=utf-8; method=REQUEST'` and an attachment with `contentType: 'application/ics'`. |
| `watchHtml` | An `alternatives` entry with `contentType: 'text/watch-html; charset=utf-8'`. |
| `baseBoundary`, `boundaryPrefix` | `boundary` option. `boundary: '--_NmP-test-Part_'` gives nodemailer's boundaries for `baseBoundary: 'test'`. |
| `keepBcc` | `keepBcc` option. |
| `textEncoding`, `encoding` | Set `transferEncoding` on a `Part` in `alternatives`. |
| `newline` | Not needed: output always uses CRLF. Use `pipeThrough` for LF. |
| `raw` | Not supported. |
| `normalizeHeaderKey` | Header names are written as given. |
| `disableFileAccess`, `disableUrlAccess` | Not needed: nothing is read from files or URLs. |
| `envelope` | Pass your own envelope to the transport. |

### Differences

- Header names keep the case you give. nodemailer capitalizes each word.
- `message/rfc822` attachments default to `attachment`, where nodemailer uses `inline`.
- A file name containing `"` is written as a quoted string with `\"` in `filename`, where nodemailer uses RFC 2231 encoding.
- A name over about 40 bytes is split into encoded words of up to 75 characters, as `@portable/mime-headers` writes them. nodemailer uses 52.
- An address with a non-ASCII local part keeps its domain as given, lowercased. nodemailer decodes an A-label domain to UTF-8 and maps it with UTS #46.
- A backslash in a domain throws.
