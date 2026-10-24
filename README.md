<div align="center">
  <h1>
    <picture><source media="(prefers-color-scheme: dark)" srcset="assets/logo-dark.svg"><img src="assets/logo-light.svg" alt="" height="32"></picture>&nbsp; Portable
  </h1>
  <p>Web-standard building blocks for any JavaScript runtime.</p>
</div>

---

#### Examples

Stream an OpenAI transcript to a file:

```ts
import * as Jsonl from '@portable/jsonl'
import * as Sse from '@portable/sse'
import * as Streams from '@portable/streams'

const response = await fetch('https://api.openai.com/v1/chat/completions', {
  method: 'POST',
  headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
  body: JSON.stringify({ model, messages, stream: true }),
})
const [live, saved] = response
  .body!.pipeThrough(new Sse.DecoderStream())
  .pipeThrough(Streams.filter((event) => event.data !== '[DONE]'))
  .pipeThrough(Streams.map((event) => JSON.parse(event.data)))
  .tee()

const saving = saved.pipeThrough(new Jsonl.EncoderStream()).pipeTo(transcript) // write to a file
const reader = live.getReader()
for (let r = await reader.read(); !r.done; r = await reader.read()) print(r.value.choices[0].delta.content ?? '')
await saving
```

Strip photo GPS metadata before uploading:

```ts
import * as Exif from '@portable/exif'
import * as ImageSize from '@portable/image-size'

const photo = await new Response(file.stream().pipeThrough(new Exif.StripStream())).blob()
const { width, height } = await ImageSize.parseStream(photo.stream())
await fetch('/upload', { method: 'POST', body: photo, headers: { 'x-size': `${width}x${height}` } })
```

Most npm packages for streams, encodings, email and crypto were written for Node. They import `node:stream`, `node:crypto` or `Buffer`, so a browser bundle needs polyfills and a Cloudflare Worker needs the `nodejs_compat` flag. Portable packages use only the APIs that every runtime has: [`fetch`](https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API), [Web Streams](https://developer.mozilla.org/en-US/docs/Web/API/Streams_API), [`Uint8Array`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Uint8Array), [`TextEncoder`](https://developer.mozilla.org/en-US/docs/Web/API/TextEncoder) and [`crypto.subtle`](https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto).

- **Only web APIs.** Lint rejects `node:*` imports, `Buffer`, `process` and DOM globals in package code. The tests run in Node 24 and 26, Bun, Deno, Chromium, Firefox and WebKit, and inside a Web Worker, and every package is loaded and checked in workerd, the Cloudflare Workers runtime.
- **No outside dependencies.** A package depends only on other `@portable/*` packages. Crypto uses WebCrypto by default, and you can pass a function from `@noble/hashes` or another library instead.
- **Tested against the npm libraries for the same job.** Each package's `PARITY.md` maps every test of those libraries to our test for the same case, or says why the case doesn't apply. Oracle tests compare our output with theirs.
- **Benchmarked.** Each package README has a table that compares its speed, bundle size and dependency count with those libraries.
- **Consistent API.** You import a package as a namespace (`import * as Base64`), call `encode` and `decode` or `parse` and `format`, pipe through a `DecoderStream` or `EncoderStream`, and pass a `signal` to anything that can be cancelled.

## Packages

<table>
<tbody>
<tr><th colspan="2" align="left">Streams and bytes</th></tr>
<tr><td><a href="packages/streams"><code>@portable/streams</code></a></td><td>Collects, combines and transforms web streams and iterables.</td></tr>
<tr><td><a href="packages/lines"><code>@portable/lines</code></a></td><td>Splits a stream of bytes or text into lines.</td></tr>
<tr><td><a href="packages/bytes"><code>@portable/bytes</code></a></td><td>Hex encoding, concatenation and constant-time comparison of <code>Uint8Array</code>s.</td></tr>
<tr><td><a href="packages/errors"><code>@portable/errors</code></a></td><td>The error classes every package throws. <code>Errors.is</code> and <code>instanceof</code> match them even when an app has two copies of a package.</td></tr>
<tr><td><a href="packages/compress"><code>@portable/compress</code></a></td><td>gzip and deflate on the platform's <code>CompressionStream</code>, a decompression stream with an output limit, and CRC-32.</td></tr>
</tbody>
<tbody>
<tr><th colspan="2" align="left">Encodings</th></tr>
<tr><td><a href="packages/base64"><code>@portable/base64</code></a></td><td>base64 and base64url, with MIME line wrapping and streams.</td></tr>
<tr><td><a href="packages/quoted-printable"><code>@portable/quoted-printable</code></a></td><td>Quoted-printable encoding and decoding, as functions and streams.</td></tr>
<tr><td><a href="packages/charset"><code>@portable/charset</code></a></td><td>Encodes text into legacy charsets such as Shift_JIS, GBK, Big5 and windows-1251.</td></tr>
<tr><td><a href="packages/idna"><code>@portable/idna</code></a></td><td>Converts domain names between Unicode and ASCII by UTS #46.</td></tr>
</tbody>
<tbody>
<tr><th colspan="2" align="left">Data formats</th></tr>
<tr><td><a href="packages/csv"><code>@portable/csv</code></a></td><td>Decodes and encodes CSV, as functions and streams.</td></tr>
<tr><td><a href="packages/jsonl"><code>@portable/jsonl</code></a></td><td>Decodes and encodes JSON Lines streams.</td></tr>
<tr><td><a href="packages/json-stream"><code>@portable/json-stream</code></a></td><td>Selects values from a large JSON document by JSONPath, and writes JSON from a tree of promises and streams.</td></tr>
</tbody>
<tbody>
<tr><th colspan="2" align="left">Email</th></tr>
<tr><td><a href="packages/mail"><code>@portable/mail</code></a></td><td>Builds a raw email message, with attachments and inline images, as a stream.</td></tr>
<tr><td><a href="packages/mime-headers"><code>@portable/mime-headers</code></a></td><td>Encoded words, folding, parameters and address lists in email headers.</td></tr>
<tr><td><a href="packages/mime-stream"><code>@portable/mime-stream</code></a></td><td>Splits a MIME message into a stream of headers and bodies and writes it back byte for byte.</td></tr>
<tr><td><a href="packages/smtp"><code>@portable/smtp</code></a></td><td>Sends email over SMTP or LMTP from any runtime with a TCP socket API.</td></tr>
<tr><td><a href="packages/dkim"><code>@portable/dkim</code></a></td><td>Signs and verifies DKIM signatures.</td></tr>
<tr><td><a href="packages/spf"><code>@portable/spf</code></a></td><td>Checks whether a client may send mail for a domain, using SPF.</td></tr>
<tr><td><a href="packages/dmarc"><code>@portable/dmarc</code></a></td><td>Checks a message against the DMARC policy of its From domain.</td></tr>
<tr><td><a href="packages/arc"><code>@portable/arc</code></a></td><td>Seals and verifies ARC sets.</td></tr>
<tr><td><a href="packages/mail-auth"><code>@portable/mail-auth</code></a></td><td>Checks a received message's SPF, DKIM, DMARC and ARC in one call, writes the Authentication-Results header, and ARC-seals it.</td></tr>
</tbody>
<tbody>
<tr><th colspan="2" align="left">DNS and networking</th></tr>
<tr><td><a href="packages/dns"><code>@portable/dns</code></a></td><td>Looks up DNS records over DNS-over-HTTPS, behind a resolver interface that <code>node:dns/promises</code> also fits.</td></tr>
<tr><td><a href="packages/dns-packet"><code>@portable/dns-packet</code></a></td><td>Encodes and decodes DNS messages in wire format.</td></tr>
<tr><td><a href="packages/ip"><code>@portable/ip</code></a></td><td>Parses, formats, compares and classifies IPv4 and IPv6 addresses and CIDR blocks.</td></tr>
<tr><td><a href="packages/rdap"><code>@portable/rdap</code></a></td><td>Looks up who holds a domain name, an IP address or an AS number over RDAP.</td></tr>
</tbody>
<tbody>
<tr><th colspan="2" align="left">Crypto and auth</th></tr>
<tr><td><a href="packages/web-crypto"><code>@portable/web-crypto</code></a></td><td>Bytes-in, bytes-out helpers over <code>crypto.subtle</code>: digests, HMAC, HKDF, Ed25519 and X25519 keys from seeds, and ECDSA signature conversion.</td></tr>
<tr><td><a href="packages/password"><code>@portable/password</code></a></td><td>Hashes and verifies passwords with PBKDF2 on WebCrypto.</td></tr>
<tr><td><a href="packages/webhooks"><code>@portable/webhooks</code></a></td><td>Verifies and signs webhooks from Standard Webhooks senders, Stripe, GitHub, Slack and other HMAC-SHA256 senders.</td></tr>
<tr><td><a href="packages/oauth1"><code>@portable/oauth1</code></a></td><td>Signs OAuth 1.0a requests.</td></tr>
<tr><td><a href="packages/random"><code>@portable/random</code></a></td><td>Unbiased random integers, strings, shuffles and bytes, and a seeded generator for tests.</td></tr>
</tbody>
<tbody>
<tr><th colspan="2" align="left">Realtime</th></tr>
<tr><td><a href="packages/websockets"><code>@portable/websockets</code></a></td><td>A WebSocket that reconnects, with a readable stream of incoming messages and a writable stream for outgoing ones.</td></tr>
<tr><td><a href="packages/sse"><code>@portable/sse</code></a></td><td>Reads, writes and reconnects server-sent event streams.</td></tr>
<tr><td><a href="packages/rpc"><code>@portable/rpc</code></a></td><td>Typed JSON-RPC 2.0 calls over a <code>MessagePort</code>, a window, a WebSocket or HTTP, with streaming results.</td></tr>
<tr><td><a href="packages/web-push"><code>@portable/web-push</code></a></td><td>Sends Web Push notifications with payload encryption and VAPID.</td></tr>
</tbody>
<tbody>
<tr><th colspan="2" align="left">Images</th></tr>
<tr><td><a href="packages/image-size"><code>@portable/image-size</code></a></td><td>Reads an image's type and dimensions from its header, from bytes or a stream.</td></tr>
<tr><td><a href="packages/exif"><code>@portable/exif</code></a></td><td>Reads EXIF metadata from JPEG, TIFF, PNG, WebP, HEIC and AVIF files, and removes it.</td></tr>
<tr><td><a href="packages/png"><code>@portable/png</code></a></td><td>Decodes PNG files to RGBA pixels and encodes pixels as PNG.</td></tr>
</tbody>
<tbody>
<tr><th colspan="2" align="left">Concurrency and timing</th></tr>
<tr><td><a href="packages/queue"><code>@portable/queue</code></a></td><td>Limits how many async tasks run at once, with priorities and cancellation.</td></tr>
<tr><td><a href="packages/timers"><code>@portable/timers</code></a></td><td>Sleep, retry, poll, debounce and throttle, all cancellable with an <code>AbortSignal</code>.</td></tr>
<tr><td><a href="packages/rate-limit"><code>@portable/rate-limit</code></a></td><td>Rate limiting per key with GCRA, in memory, Workers KV, a Durable Object or Redis over HTTP.</td></tr>
</tbody>
</table>

## Contributing

See [docs/architecture.md](docs/architecture.md) for how the repo is built and tested, and [AGENTS.md](AGENTS.md) for the commands and the rules contributors follow.

## License

MIT
