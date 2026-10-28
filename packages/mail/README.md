# @portable/mail

Builds a raw RFC 5322 email message, with text and HTML alternatives, attachments, inline images, and custom headers, as a `ReadableStream<Uint8Array>`. It doesn't send mail: pass the result to an SMTP client or to an email API that takes raw MIME, or write it to an `.eml` file. Runs in browsers, Cloudflare Workers, Node 24+, Bun, and Deno.

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

The report is read from the network while you read the message, so a large attachment is never held in memory. Cancelling `raw` cancels the response body.

## API

| Export | Description |
| --- | --- |
| `encodeStream(message, options?)` | Returns the message as a `ReadableStream<Uint8Array>` with CRLF line breaks. If the message can't be written, `encodeStream` throws `InvalidInputError`, `TypeError`, or `RangeError` when it is called, before it reads any content. |
| `envelope(message)` | Returns `{ from, to }`: the first `From` address (else `Sender`) and every `To`, `Cc`, and `Bcc` address once, with group members in place of groups. Throws `InvalidInputError` if the message has neither a `From` nor a `Sender` address. The result has the fields `Smtp.send` takes for the envelope. |
| `InvalidInputError` | Thrown for an address, header name, content type, file name, or `Date` that can't be written, and for a name in `headers` that has its own field in the message, such as `From`. |
| `Message`, `Attachment`, `Part`, `Content`, `Addresses`, `Mailbox`, `HeaderFields`, `TransferEncoding`, `Envelope`, `Instant` | Types. |

### Message

| Field | Type | Description |
| --- | --- | --- |
| `from`, `sender`, `to`, `cc`, `replyTo` | `Addresses` | An address list as text (`'Mari <mari@example.com>, b@example.com'`), a `{ name?, address }`, or a list of either. Groups are allowed in text. |
| `bcc` | `Addresses` | Read by `envelope`. `encodeStream` writes the header only with `keepBcc`. |
| `subject` | `string` | Encoded as RFC 2047 words when it isn't printable ASCII. |
| `messageId`, `inReplyTo` | `string` | Angle brackets are added if missing. The default Message-ID is a random ID at the `From` domain, or at `localhost` if there is no `From`. |
| `references` | `string \| string[]` | Message IDs separated by whitespace. |
| `date` | `Date \| Instant \| string` | Defaults to now. A `Date`, a `Temporal.Instant`, or a `Temporal.ZonedDateTime` is written in UTC, as `Tue, 2 Jan 2024 03:04:05 +0000`. A string is written as given. |
| `text`, `amp`, `html` | `Content` | The bodies, written as `multipart/alternative` in that order. An empty string counts as no body. A message with no body gets an empty `text/plain` body. |
| `alternatives` | `Part[]` | More alternatives after the HTML, each `{ content, contentType, headers?, transferEncoding? }`. A string `content` is written as UTF-8 whatever `charset` is, so include `charset=utf-8` in a text `contentType`. |
| `attachments` | `Attachment[]` | Each `{ content, filename?, contentType?, cid?, disposition?, headers?, transferEncoding? }`. |
| `headers` | `HeaderFields` | Extra header fields, written first, in order. A list value is written as one field per value. `encodeStream` throws `InvalidInputError` for a name that has its own field in the message, in these headers and in the `headers` of a `Part` or `Attachment`. These names include `From`, `Subject`, `Message-ID`, `Date`, and `Content-Type`. Line breaks in a value become spaces, and non-ASCII text is written as encoded words. |

`Content` is a `string`, `Uint8Array`, `Blob` (including `File`), or `ReadableStream<Uint8Array>`. A `File` gives the attachment its file name and a `Blob` its content type.

If the message has an HTML body, attachments with a `cid` go into `multipart/related` beside it. Other attachments go into `multipart/mixed`, and so do attachments with a `cid` if there is no HTML body. An image with a `cid` defaults to `Content-Disposition: inline`, everything else to `attachment`.

Text bodies are `7bit` when every line is ASCII and at most 76 characters, otherwise `quoted-printable` for mostly Latin text and `base64` for the rest. `encodeStream` can't scan a body from a stream or `Blob` before writing it, so it writes that body as `quoted-printable`. Attachments are `base64`, except `message/*`, which is `8bit`. Line breaks in `7bit`, `8bit`, and text `quoted-printable` bodies become CRLF.

### Options

| Option | Default | Description |
| --- | --- | --- |
| `boundary` | `'=_'`, 16 random hex digits, `'_'` | The start of every multipart boundary. Each boundary is this value followed by the position of its multipart among all parts, leaves included, counted from 1 in the order the parts are written. Up to 60 characters from RFC 2046's `bchars`; anything else throws `RangeError`. |
| `charset` | UTF-8 | A `CharsetEncoder` (`{ name, encode(text) }`) for encoded words and for `text`, `amp`, and `html` given as strings, for mail that has to use another charset. [@portable/charset](https://portablejs.com/packages/charset) loads a `CharsetEncoder` for each of its charsets. |
| `keepBcc` | `false` | Write the `Bcc` header, for a transport such as sendmail that reads recipients from it. |
| `signal` | | Aborting it errors the result with `signal.reason` and cancels every content stream not yet read. |

Set `boundary`, `messageId`, and `date` to get the same bytes on every run, for example in tests.

```ts
import { iso2022Jp } from '@portable/charset/iso-2022-jp';

Mail.encodeStream(
  { from: 'テスト <a@example.com>', subject: 'こんにちは', text: 'こんにちは' },
  { charset: iso2022Jp },
);
```

### Signing and sending

[@portable/dkim](https://portablejs.com/packages/dkim) signs the bytes `encodeStream` produces and [@portable/smtp](https://portablejs.com/packages/smtp) sends them. `Dkim.sign` needs the whole body to compute the signature field, which goes above the other headers, so read the message into bytes first:

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

Without DKIM, pass the stream from `Mail.encodeStream(message)` to `Smtp.send`, which sends each chunk as soon as it reads it.

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

nodemailer's composer needs Node streams, `Buffer`, `fs`, `http`, and `crypto`, so it doesn't run in browsers or Workers. This package uses only web APIs and has no dependencies outside `@portable/*`. With the same boundary, Message-ID, and Date, its output matches `MailComposer` byte for byte on most messages: 254 of 300 generated messages in the oracle test were identical, and the other 46 differed only where libqp breaks a quoted-printable line.

- In the benchmarks on Node 24, `encodeStream` was 3× faster than `MailComposer` on 100 text and HTML messages. `MailComposer` was 1.5× faster with a 1 MB attachment in memory and 1.2× faster with a 4 MB attachment read from a stream. There is no native API that composes MIME to compare with.
- Line breaks in `7bit` and `8bit` bodies are written as CRLF. Without its `newline` option, nodemailer writes a bare LF as is, which is how SMTP smuggling starts.
- An invalid address, such as `a,b@good.com`, `a@evil.com@good.com`, or a bare `root`, throws `InvalidInputError`. nodemailer quotes it or keeps it and sends the message.
- `encodeStream` throws for a recipient that is only a comment, such as `(a@evil.com)`, instead of dropping it.
- Text that looks like an encoded word (`=?x?q?y?=`) is encoded, so the recipient's mail client shows the subject as the sender wrote it instead of decoding it. Quotes in a subject are written as they are, so they stay readable, but nodemailer 10.2.1 encodes them.
- A `Uint8Array` text body is scanned like a string and can be `7bit`. nodemailer always encodes a `Buffer` body.
- `Message` has no `path` or `href` field, so untrusted input can't make the composer read a file or fetch a URL. Pass `(await fetch(url)).body` or a `File` instead.
- Cancelling the output cancels every content stream that hasn't been read, and a failing stream errors the output and cancels the rest.
- nodemailer's `getEnvelope()` returns `from: false` for a message without a sender, and `envelope` throws `InvalidInputError`.
- nodemailer accepts a Node `Readable` as attachment `content`. Here pass a `ReadableStream`, which `Readable.toWeb(stream)` returns in Node.
- nodemailer detects `contentType` from the file name, and this package doesn't: an attachment without `contentType` gets the `Blob`'s type or `application/octet-stream`. @remix-run/mime maps file names to types.
- nodemailer's `encoding: 'base64'` on string content has no equivalent. Decode the string first and pass the bytes.
- nodemailer's `icalEvent` has no equivalent. Add an `alternatives` entry with `contentType: 'text/calendar; charset=utf-8; method=REQUEST'` and an attachment with `contentType: 'application/ics'`.
- nodemailer's `watchHtml` has no equivalent. Add an `alternatives` entry with `contentType: 'text/watch-html; charset=utf-8'`.
- nodemailer's `baseBoundary` and `boundaryPrefix` have no equivalent. `boundary: '--_NmP-test-Part_'` gives the boundaries nodemailer writes for `baseBoundary: 'test'`.
- nodemailer's `textEncoding` and `encoding` options have no equivalent. Set `transferEncoding` on a `Part` in `alternatives`.
- nodemailer's `newline` option has no equivalent, because the output always uses CRLF. Pipe it through a `TransformStream` to get LF.
- nodemailer's `raw` option isn't supported.
- nodemailer's `envelope` option has no equivalent. Pass your own envelope to the transport.
- nodemailer capitalizes each word of a header name, and its `normalizeHeaderKey` option has no equivalent, because this package writes header names as given.
- nodemailer makes `message/rfc822` attachments `inline`, and this package makes them `attachment`.
- nodemailer writes a file name containing `"` with RFC 2231 encoding, and this package writes it as a quoted string with `\"` in `filename`.
- nodemailer splits a name longer than about 40 bytes into encoded words of up to 52 characters, and this package uses up to 75, as [@portable/mime-headers](https://portablejs.com/packages/mime-headers) writes them.
- nodemailer decodes an A-label domain to UTF-8 and maps it with UTS #46 when the local part isn't ASCII. This package keeps the domain as given, lowercased.
- nodemailer accepts a backslash in a domain, and this package throws for it.

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
