---
description: Install a Portable package and run the same code in browsers, Cloudflare Workers, Deno, Bun, and Node 24+.
---

# Getting started

Portable is a set of small npm packages built only on web-standard APIs: Web Streams, `Uint8Array`, `TextEncoder`, `fetch`, and `crypto.subtle`. The same code runs in browsers, Cloudflare Workers, Deno, Bun, and Node 24+. You don't need polyfills or the `nodejs_compat` flag.

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

All packages follow the same [conventions](/conventions) for names, options, errors, and cancellation.

### Use in a browser

With a bundler, import the package as in the example above. Without one, import it from esm.sh in a module script:

```js
import * as Streams from 'https://esm.sh/@portable/streams';
```

esm.sh rewrites the imports between `@portable/*` packages to esm.sh URLs. You don't need an import map.

## Runtimes

The tests run in Chromium, Firefox, WebKit, Deno, Bun, and Node, and a check of every package runs in workerd, the Cloudflare Workers runtime.

`@portable/smtp` and `@portable/sockets` need a TCP socket API, so they run in Cloudflare Workers, Deno, Bun and Node but not in browsers.
