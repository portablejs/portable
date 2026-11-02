---
description: Install a Portable package and run the same code in browsers, Cloudflare Workers, Node 24+, Bun, and Deno.
---

# Getting started

Portable packages use only the web APIs that browsers, Cloudflare Workers, Node 24+, Bun, and Deno share, such as `fetch`, streams, and `crypto.subtle`. They run in all of these without polyfills or the `nodejs_compat` flag.

The [web platform](/web-platform) page lists a package for each common task, from Portable or other projects.

## Install a package

Install only the packages you use. They are ESM-only and depend only on other `@portable/*` packages.

```sh
npm install @portable/streams
```

## Import a package

Import a package as a namespace and call its exports through it, such as `Streams.toJson`. This Cloudflare Worker reads a JSON request body and responds with 413 if it exceeds 1 MB:

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

See [Conventions](#conventions) for how packages handle bytes, cancellation, and errors.

### Use in a browser

Without a bundler, import from esm.sh in a module script:

```js
import * as Streams from 'https://esm.sh/@portable/streams';
```

esm.sh rewrites imports between `@portable/*` packages to esm.sh URLs, so you don't need an import map.

## Runtimes

The tests run in Chromium, Firefox, WebKit, Node, Bun, and Deno. A check of every package runs in workerd, the Cloudflare Workers runtime.

[@portable/smtp](/packages/smtp) and [@portable/sockets](/packages/sockets) need a TCP socket API, so they run in Cloudflare Workers, Node, Bun, and Deno but not in browsers.

## Conventions

Functions take and return bytes as `Uint8Array`. A Node `Buffer` works, because it is a `Uint8Array`. Wrap an `ArrayBuffer` or another typed array in `new Uint8Array(...)`, or the function throws a `TypeError`. Functions that take text also take its bytes.

A streaming transform is a `TransformStream` that you pass to `pipeThrough`, such as `Lines.DecoderStream`. Encoder streams output `Uint8Array` chunks, so you can use their output as a `Response` body.

Durations are in milliseconds unless the protocol sets the unit (e.g. Web Push `ttl` is in seconds).

Options that take a time, such as `now`, accept a `Date`, a `Temporal.Instant`, or a `Temporal.ZonedDateTime`. Results use `Date`, because Safari doesn't have Temporal yet.

Every async function and stream takes a `signal` option. Aborting it stops the function's `fetch` calls, timers, and nested streams, and rejects with `signal.reason`. To limit a whole call, pass `AbortSignal.timeout(ms)` as the `signal`.

Some objects keep running after you create them, such as an SMTP client, a queue, or a WebSocket. To stop one, call `close()` or abort the `signal` you created it with.
 Where the runtime has `Symbol.asyncDispose`, `await using` closes them when the block exits.

Function names use these verbs:

| Verb | What it does | Example |
| --- | --- | --- |
| `encode`, `decode` | Converts a value to bytes or text, and back. | `Base64.encode(bytes)` |
| `parse` | Reads a value out of bytes, with no function for the other direction. | `ImageSize.parse(bytes)` |
| `parse`, `format` | Reads and writes a text syntax such as an address list. | `MimeHeaders.parseAddresses(text)` |
| `…Stream` suffix | Reads its input from a stream, or returns its output as one. | `ImageSize.parseStream(stream)` |
| `…Sync` suffix | Is the sync version of an async function. | |

Functions throw these errors:

| Error | Thrown when |
| --- | --- |
| `InvalidInputError` | The data is malformed. Catch it when the input comes from outside your program. |
| `TruncatedError` | The input ended early. |
| `UnsupportedError` | The input is valid, but the package doesn't handle it. |
| `MaxBytesError`, `MaxLengthError` | The input or output exceeded `maxBytes` or `maxLength`. The error stores the limit. |
| `ResponseError` | The server returned a status or body the package can't use. The error keeps the `Response`. |
| `TypeError`, `RangeError` | An argument or option is missing, has the wrong type, or has a value the function doesn't accept. Fix the call instead of catching these. |

Each error's `name` starts with the package namespace, such as `Lines.MaxLengthError`. `Errors.is` from [errors](/packages/errors) matches a kind across packages: `Errors.is(error, 'MaxBytes')` matches any package's `MaxBytesError`.

