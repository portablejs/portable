---
description: Install a Portable package and run the same code in browsers, Cloudflare Workers, Node 24+, Bun, and Deno.
---

# Getting started

Portable is a set of small npm packages built only on web-standard APIs: Web Streams, `Uint8Array`, `TextEncoder`, `fetch`, and `crypto.subtle`. The same code runs in browsers, Cloudflare Workers, Node 24+, Bun, and Deno. You don't need polyfills or the `nodejs_compat` flag.

## Install a package

Install only the packages you use. They are ESM-only, and their only runtime dependencies are other `@portable/*` packages.

```sh
npm install @portable/streams
```

## Import a package

Import a package as a namespace. Export names are short, such as `toJson`, because the namespace shows the package. This Cloudflare Worker reads a JSON request body, and if the body exceeds 1 MB, it stops reading and responds with 413:

```ts
import * as Streams from '@portable/streams';

export default {
  async fetch(request: Request) {
    try {
      const body = await Streams.toJson(request.body!, {
        maxBytes: 1_000_000,
      });
      return Response.json({ received: body });
    } catch (error) {
      if (error instanceof Streams.MaxBytesError) {
        return new Response('Body too large', { status: 413 });
      }
      throw error;
    }
  },
};
```

All packages follow the same [package conventions](#package-conventions) for names, bytes, cancellation, and errors.

### Use in a browser

With a bundler, import the package as in the example above. Without one, import it from esm.sh in a module script:

```js
import * as Streams from 'https://esm.sh/@portable/streams';
```

esm.sh rewrites the imports between `@portable/*` packages to esm.sh URLs. You don't need an import map.

## Runtimes

The tests run in Chromium, Firefox, WebKit, Node, Bun, and Deno, and a check of every package runs in workerd, the Cloudflare Workers runtime.

@portable/smtp and @portable/sockets need a TCP socket API, so they run in Cloudflare Workers, Node, Bun, and Deno but not in browsers.

## Package conventions

Every package follows the same conventions, so once you've used one, you know how the others work:

- Import a package as a namespace, such as `import * as Csv from '@portable/csv'`, and call `Csv.decode` or `new Csv.DecoderStream()`.
- Bytes go in and come out as `Uint8Array`, and a Node `Buffer` is accepted. Functions that take text also take its bytes, and they return text as a `string`.
- A streaming transform is a `TransformStream` that you pass to `pipeThrough`, as with `TextDecoderStream`. A `DecoderStream` reads bytes or text into values, and an `EncoderStream` writes values as bytes.
- Durations are in milliseconds unless the protocol sets the unit. Options that take a point in time accept a `Date` or a `Temporal.Instant`, and results return a `Date`.
- Every async function and every stream takes a `signal`. Aborting it stops the `fetch` calls, timers, and nested streams underneath, and the call rejects with `signal.reason`, as `fetch` does. For a timeout, pass `AbortSignal.timeout(ms)`.
- An object that stays open, such as an SMTP client, a queue, or a WebSocket, has a `close()` method, a `signal` option that closes it, or both. It works with `await using` where the runtime has `Symbol.asyncDispose`.

Each verb has one meaning in every package:

| Verb | Meaning | Example |
| --- | --- | --- |
| `encode`, `decode` | Convert between a value and its bytes or text. | `Base64.encode(bytes)` |
| `parse` | Read a value out of bytes. There is no function for the other direction. | `ImageSize.parse(bytes)` |
| `parse`, `format` | Read and write a text syntax that people also read, such as an address list. | `MimeHeaders.parseAddresses(text)` |
| `…Stream` suffix | Do the same on a stream. | `ImageSize.parseStream(stream)` |
| `…Sync` suffix | The sync version of an async function. | |

Functions throw errors instead of returning them:

| Error | Thrown when |
| --- | --- |
| `InvalidInputError` | The data that the function reads, decodes, encodes, or verifies is malformed. Catch this error for input from outside your program. |
| `TruncatedError` | The input ended early. |
| `UnsupportedError` | The input is valid, but the package doesn't handle it. |
| `MaxBytesError`, `MaxLengthError` | The input or output exceeded the `maxBytes` or `maxLength` option. The error stores the limit. |
| `ResponseError` | A server answered with a status or body that the package can't use. The error keeps the whole `Response`. |
| `TypeError`, `RangeError` | An argument or option is missing, has the wrong type, or has a value that the function doesn't accept. These errors mean the calling code has a bug. |

Each error's `name` starts with the package's namespace, such as `Lines.MaxLengthError`. `Errors.is(error, 'MaxBytes')` from [@portable/errors](/packages/errors) matches any package's `MaxBytesError`, even when two copies of the package are installed.
