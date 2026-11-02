# @portable/mail

Builds a raw email message, with text and HTML bodies, attachments, inline images, and custom headers, as a `ReadableStream<Uint8Array>`. Pass it to an SMTP client or an email API that takes raw MIME, or write it to an `.eml` file. Runs in browsers, Cloudflare Workers, Node 24+, Bun, and Deno.

Replaces nodemailer's `MailComposer` (`nodemailer/lib/mail-composer`) and the `MimeNode` it builds on.

```sh
npm install @portable/mail
```

```ts
import * as Mail from '@portable/mail';

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
};

const raw = Mail.encodeStream(message); // ReadableStream<Uint8Array>
const { from, to } = Mail.envelope(message); // for MAIL FROM and RCPT TO

await fetch('https://api.example.com/send-raw', { method: 'POST', body: raw, duplex: 'half' });
```

Attachments are read only as you read the message, so a large attachment is never held in memory. Cancelling `raw` cancels the response body.

## API

| Export | Description |
| --- | --- |
| `encodeStream(message, options?)` | Returns the message as a `ReadableStream<Uint8Array>` with CRLF line breaks. Throws `InvalidInputError`, `TypeError`, or `RangeError` for an invalid message before it reads any content. |
| `envelope(message)` | Returns `{ from, to }` for `Smtp.send`: the first `From` address (else `Sender`), and every `To`, `Cc`, and `Bcc` address once. Throws `InvalidInputError` if there is no `From` or `Sender`. |
| `InvalidInputError` | Thrown for an address, header, content type, file name, or `Date` that can't be written. |
| `Message`, `Attachment`, `Part`, `Content`, `Addresses`, `Mailbox`, `HeaderFields`, `TransferEncoding`, `Envelope`, `Instant` | Types. |

### Message

| Field | Type | Description |
| --- | --- | --- |
| `from`, `sender`, `to`, `cc`, `replyTo` | `Addresses` | An address list as text (`'Mari <mari@example.com>, b@example.com'`, groups allowed), a `{ name?, address }`, or a list of either. |
| `bcc` | `Addresses` | Read by `envelope`. `encodeStream` writes the header only with `keepBcc`. |
| `subject` | `string` | Encoded as RFC 2047 words when it isn't printable ASCII. |
| `messageId`, `inReplyTo` | `string` | Angle brackets are added if missing. The default Message-ID is random, at the `From` domain or `localhost`. |
| `references` | `string \| string[]` | Message IDs separated by whitespace. |
| `date` | `Date \| Instant \| string` | Defaults to now. An instant is written in UTC, as `Tue, 2 Jan 2024 03:04:05 +0000`. A string is written as given. |
| `text`, `amp`, `html` | `Content` | The bodies, written as `multipart/alternative` in that order. An empty string counts as no body. With no body, an empty `text/plain` body is written. |
| `alternatives` | `Part[]` | More alternatives after the HTML, each `{ content, contentType, headers?, transferEncoding? }`. A string `content` is always UTF-8, so include `charset=utf-8` in a text `contentType`. |
| `attachments` | `Attachment[]` | Each `{ content, filename?, contentType?, cid?, disposition?, headers?, transferEncoding? }`. |
| `headers` | `HeaderFields` | Extra header fields, written first, in order. A list value is written as one field per value. Throws `InvalidInputError` for a field `encodeStream` writes itself, such as `From`, `Date`, or `Content-Type`. The same applies to the `headers` of a `Part` or `Attachment`. Line breaks in a value become spaces, and non-ASCII text is written as encoded words. |

`Content` is a `string`, `Uint8Array`, `Blob` (including `File`), or `ReadableStream<Uint8Array>`. An attachment takes its file name from a `File` and its content type from a `Blob`.

Attachments with a `cid` go into `multipart/related` beside the HTML body. Other attachments, and all attachments if there is no HTML body, go into `multipart/mixed`. An image with a `cid` is `inline` by default, and everything else is `attachment`.

Text bodies are `7bit` if every line is ASCII and at most 76 characters. Otherwise they are `quoted-printable` for mostly Latin text and `base64` for the rest. A body from a stream or `Blob` can't be scanned first, so it is `quoted-printable`.

Attachments are `base64`, except `message/*`, which is `8bit`. Line breaks in `7bit`, `8bit`, and text `quoted-printable` bodies become CRLF.

### Options

| Option | Default | Description |
| --- | --- | --- |
| `boundary` | `'=_'`, 16 random hex digits, `'_'` | The prefix of every multipart boundary, followed by the multipart's position among all parts, counted from 1. Up to 60 characters from RFC 2046's `bchars`. Throws `RangeError` for any other value. |
| `charset` | UTF-8 | A `CharsetEncoder` (`{ name, encode(text) }`) for encoded words and for string `text`, `amp`, and `html`. [@portable/charset](https://portablejs.com/packages/charset) has one for each of its charsets. |
| `keepBcc` | `false` | Write the `Bcc` header, for a transport such as sendmail that reads recipients from it. |
| `signal` | | Aborting errors the result with `signal.reason` and cancels every unread content stream. |

To get the same bytes on every run, e.g. in tests, set `boundary`, `messageId`, and `date`.

```ts
import { iso2022Jp } from '@portable/charset/iso-2022-jp';

Mail.encodeStream(
  { from: 'テスト <a@example.com>', subject: 'こんにちは', text: 'こんにちは' },
  { charset: iso2022Jp },
);
```

### Signing and sending

Sign the message with [@portable/dkim](https://portablejs.com/packages/dkim) and send it with [@portable/smtp](https://portablejs.com/packages/smtp). The signature goes above the other headers and covers the whole body, so read the message into bytes first:

```ts
import * as Bytes from '@portable/bytes';
import * as Dkim from '@portable/dkim';
import * as Mail from '@portable/mail';
import * as Smtp from '@portable/smtp';
import * as Streams from '@portable/streams';
import { connect } from 'cloudflare:sockets';

const signal = AbortSignal.timeout(30_000);
const raw = await Streams.toBytes(Mail.encodeStream(message, { signal }));
const field = await Dkim.sign(raw, {
  domain: 'example.com',
  selector: 'mail',
  privateKey: env.DKIM_PRIVATE_KEY,
  signal,
});
await Smtp.send(
  { ...Mail.envelope(message), message: Bytes.concat([new TextEncoder().encode(field), raw]) },
  { connect, host: 'smtp.example.com', auth: { user: 'mari@example.com', pass: env.SMTP_PASSWORD }, signal },
);
```

Without DKIM, pass the stream from `Mail.encodeStream(message)` straight to `Smtp.send`.

## Types

| Type | Description |
| --- | --- |
| `Mail.Message` | A message to encode. Every field is optional. |
| `Mail.Addresses` | An address list as text, a `Mailbox`, or a list of either. |
| `Mail.Mailbox` | `{ name?, address }`. |
| `Mail.Content` | Text, bytes, a `Blob`, or a byte stream, for a body or an attachment. |
| `Mail.Attachment` | A file attached to the message, or an inline image the HTML refers to as `cid:<cid>`. |
| `Mail.Part` | An alternative body, such as a calendar invitation. |
| `Mail.HeaderFields` | Extra header fields by name, with a list for repeated fields. |
| `Mail.TransferEncoding` | `'7bit'`, `'8bit'`, `'quoted-printable'`, or `'base64'`. |
| `Mail.Envelope` | `{ from, to }`, what `envelope` returns. |
| `Mail.Instant` | `Timers.Instant`: a `Date`, or any object with `epochMilliseconds`, such as a `Temporal.Instant` or `Temporal.ZonedDateTime`. |

## Why use this over nodemailer

nodemailer's composer needs Node streams, `Buffer`, `fs`, `http`, and `crypto`, so it doesn't run in browsers or Workers. With the same boundary, Message-ID, and Date, this package's output matches `MailComposer` byte for byte on 254 of 300 generated messages. The other 46 differ only where libqp breaks a quoted-printable line.

- `encodeStream` is 3× faster than `MailComposer` on text and HTML messages. `MailComposer` is 1.2× to 1.5× faster with a 1 MB or 4 MB attachment.
- Line breaks in `7bit` and `8bit` bodies are written as CRLF. nodemailer writes a bare LF as is unless you set `newline`, which allows SMTP smuggling.
- An invalid address, such as `a,b@good.com`, `a@evil.com@good.com`, or a bare `root`, throws `InvalidInputError`. nodemailer quotes or keeps it and sends the message.
- A recipient that is only a comment, such as `(a@evil.com)`, throws instead of being dropped.
- Text that looks like an encoded word (`=?x?q?y?=`) is encoded, so mail clients show the subject as written. Quotes in a subject are written as is. nodemailer 10.2.1 encodes them.
- A `Uint8Array` text body can be `7bit`. nodemailer always encodes a `Buffer` body.
- There is no `path` or `href` field, so untrusted input can't make the composer read a file or fetch a URL. Pass `(await fetch(url)).body` or a `File` instead.
- `envelope` throws `InvalidInputError` for a message without a sender. nodemailer's `getEnvelope()` returns `from: false`.
- Attachment `content` takes a `ReadableStream`, not a Node `Readable`. In Node, convert with `Readable.toWeb(stream)`.
- `contentType` isn't detected from the file name. Without it, an attachment gets the `Blob`'s type or `application/octet-stream`. @remix-run/mime maps file names to types.
- Header names are written as given. nodemailer capitalizes each word, and its `normalizeHeaderKey` option has no equivalent.
- `message/rfc822` attachments are `attachment`, not `inline`.
- A file name containing `"` is written as a quoted string with `\"`, not with RFC 2231 encoding.
- Encoded words in names are up to 75 characters, as [@portable/mime-headers](https://portablejs.com/packages/mime-headers) writes them. nodemailer splits names longer than about 40 bytes into words of up to 52.
- Domains are kept as given, lowercased. nodemailer decodes an A-label domain and maps it with UTS #46 when the local part isn't ASCII.
- A backslash in a domain throws. nodemailer accepts it.

These nodemailer options have no equivalent:

- `encoding: 'base64'` on string content: decode the string and pass the bytes.
- `icalEvent`: add an `alternatives` entry with `contentType: 'text/calendar; charset=utf-8; method=REQUEST'` and an attachment with `contentType: 'application/ics'`.
- `watchHtml`: add an `alternatives` entry with `contentType: 'text/watch-html; charset=utf-8'`.
- `baseBoundary` and `boundaryPrefix`: `boundary: '--_NmP-test-Part_'` gives the boundaries nodemailer writes for `baseBoundary: 'test'`.
- `textEncoding` and `encoding`: set `transferEncoding` on a `Part` in `alternatives`.
- `newline`: the output always uses CRLF. Pipe it through a `TransformStream` to get LF.
- `raw`.
- `envelope`: pass your own envelope to the transport.

<!-- bench:start -->
<table>
<thead><tr><th align="left">Library</th><th align="right">Ops/s</th><th align="left">Relative</th><th></th></tr></thead>
<tbody>
<tr><th colspan="4" align="left">Encode 100 text and HTML messages</th></tr>
<tr><td>@portable/mail</td><td align="right">89.6</td><td></td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="160" height="12" alt="" /></td></tr>
<tr><td>nodemailer</td><td align="right">30.1</td><td>3.0× slower</td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="54" height="12" alt="" /></td></tr>
<tr><th colspan="4" align="left">Encode a message with a 1 MB attachment</th></tr>
<tr><td>nodemailer</td><td align="right">337</td><td>1.5× faster</td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="160" height="12" alt="" /></td></tr>
<tr><td>@portable/mail</td><td align="right">218</td><td></td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="104" height="12" alt="" /></td></tr>
<tr><th colspan="4" align="left">Encode a message with a 4 MB attachment from a stream</th></tr>
<tr><td>nodemailer</td><td align="right">77.0</td><td>1.2× faster</td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="160" height="12" alt="" /></td></tr>
<tr><td>@portable/mail</td><td align="right">66.6</td><td></td><td><img src="https://portablejs.com/readme/benchmark-bar.svg" width="138" height="12" alt="" /></td></tr>
</tbody>
</table>

Operations per second from `pnpm bench`, higher is better, in Node 24.22.0, on Intel(R) Xeon(R) Processor @ 2.10GHz (4 cores). Each benchmark lists only the libraries that can do the same work, fastest first. The relative speed compares each library with @portable/mail, and the bars are scaled to the fastest library.

| Library | Version | Minified and gzipped | Runtime dependencies | Node built-ins | TypeScript types |
| --- | --- | ---: | ---: | --- | --- |
| @portable/mail | – | 13 kB | 8 | none | included |
| nodemailer | 10.2.1 | 39 kB | 0 | `Buffer`, `crypto`, `dns`, `fs`, `http`, `https`, `net`, `os`, `path`, `stream`, `url`, `util`, `zlib` | none |

Sizes cover the imports in the usage example, or the equivalent imports of each library, bundled for the browser by `scripts/bundle-size.ts`. Runtime dependencies count every package installed with the published package. A library that uses Node built-ins needs polyfills in a browser and the `nodejs_compat` flag in Cloudflare Workers.
<!-- bench:end -->
