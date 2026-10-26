---
description: Install a Portable package and run the same code in browsers, Cloudflare Workers, Node 24+, Bun, and Deno.
---

# Getting started

Browsers, Cloudflare Workers, Node 24+, Bun, and Deno now share these APIs: `fetch`, Web Streams, `Uint8Array`, `TextEncoder`, and `crypto.subtle`. Portable provides small npm packages built only on those APIs. They run in every one of those runtimes, with no polyfills and no `nodejs_compat` flag.

Many existing packages already run in all five runtimes too. Portable packages try to fill the gaps. The [web platform](/web-platform) page lists a package for each common task, from Portable or another project.

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

For how packages handle bytes, cancellation, and errors, see [Conventions](#conventions).

### Use in a browser

With a bundler, import the package as in the example above. Without one, import it from esm.sh in a module script:

```js
import * as Streams from 'https://esm.sh/@portable/streams';
```

esm.sh rewrites the imports between `@portable/*` packages to esm.sh URLs. You don't need an import map.

## Runtimes

The tests run in Chromium, Firefox, WebKit, Node, Bun, and Deno, and a check of every package runs in workerd, the Cloudflare Workers runtime.

[@portable/smtp](/packages/smtp) and [@portable/sockets](/packages/sockets) need a TCP socket API, so they run in Cloudflare Workers, Node, Bun, and Deno but not in browsers.

## Conventions

Every package follows these conventions.

Import a package as a namespace, such as `import * as Csv from '@portable/csv'`, and then call `Csv.decode` or `new Csv.DecoderStream()`.

Functions take and return bytes as `Uint8Array`. You can pass a Node `Buffer`, because it is a `Uint8Array`. An `ArrayBuffer` or another typed array throws a `TypeError`, so wrap it in `new Uint8Array(...)` first. Functions that take text also accept its bytes.

A streaming transform is a `TransformStream` that you pass to `pipeThrough`. For example, `Lines.DecoderStream` splits bytes into lines. `Jsonl.EncoderStream` writes values as `Uint8Array` chunks, so you can pass its output as a `Response` body.

Durations are in milliseconds unless the protocol sets the unit. Web Push, for example, sets `ttl` in seconds. When an option takes a point in time, such as `now`, you can pass a `Date`, a `Temporal.Instant`, or a `Temporal.ZonedDateTime`. Functions return points in time as `Date` because Safari doesn't have Temporal yet.

Every async function and every stream takes a `signal` option. If the signal aborts, the function stops its `fetch` calls, timers, and nested streams, then rejects with `signal.reason`, as `fetch` does. There is no `timeout` option for a whole call; pass `AbortSignal.timeout(ms)` as the `signal` instead.

Some objects keep a socket, timer, or task running after the call that creates them returns. An SMTP client, a queue, and a WebSocket all work this way. To shut one down, call its `close()` method or abort the `signal` you created it with. If the runtime has `Symbol.asyncDispose`, you can declare the object with `await using`, which closes it when the block exits.

Function names use these verbs:

| Verb | What it does | Example |
| --- | --- | --- |
| `encode`, `decode` | Converts a value to bytes or text, and back. | `Base64.encode(bytes)` |
| `parse` | Reads a value out of bytes, with no function for the other direction. | `ImageSize.parse(bytes)` |
| `parse`, `format` | Reads and writes a text syntax such as an address list. | `MimeHeaders.parseAddresses(text)` |
| `…Stream` suffix | Reads its input from a stream, or returns its output as one. | `ImageSize.parseStream(stream)` |
| `…Sync` suffix | Is the sync version of an async function. | |

Functions throw these errors instead of returning them:

| Error | Thrown when |
| --- | --- |
| `InvalidInputError` | The data that the function reads, decodes, encodes, or verifies is malformed. Catch it when the input comes from outside your program. |
| `TruncatedError` | The input ended early. |
| `UnsupportedError` | The input is valid, but the package doesn't handle it. |
| `MaxBytesError`, `MaxLengthError` | The input or output exceeded the `maxBytes` or `maxLength` option. The error stores the limit. |
| `ResponseError` | The server returned a status or body that the package can't use. The error keeps the whole `Response`. |
| `TypeError`, `RangeError` | An argument or option is missing, has the wrong type, or has a value that the function doesn't accept. Fix the call instead of catching these errors. |

Each error's `name` starts with the package namespace, such as `Lines.MaxLengthError`. If your app installs two copies of a package, `instanceof` fails for errors from the other copy. Use `Errors.is` from [@portable/errors](/packages/errors) instead: `Errors.is(error, 'MaxBytes')` matches the `MaxBytesError` of any package.
