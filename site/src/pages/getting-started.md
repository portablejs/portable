# Getting started

Portable is a set of small npm packages built only on web-standard APIs: Web Streams, `Uint8Array`, `TextEncoder`, `fetch`, and `crypto.subtle`. The same code runs in browsers, Cloudflare Workers, Bun, and Node 24 or later. You don't need polyfills or the `nodejs_compat` flag.

Each package replaces a popular Node-only library.

## Install a package

Install only the packages you use. They are ESM-only, and their only runtime dependencies are other `@portable/*` packages.

```sh
npm install @portable/lines
```

## Use

Import a package as a namespace. Exports have short names such as `DecoderStream`, and the namespace shows which package each one comes from. This Cloudflare Worker counts the lines of a log file. The same code runs in Node and Bun:

```ts
import * as Lines from '@portable/lines'
import * as Streams from '@portable/streams'

export default {
  async fetch() {
    const response = await fetch('https://example.com/access.log')
    const lines = await Streams.toArray(
      response.body!.pipeThrough(new Lines.DecoderStream()),
    )
    return Response.json({ lines: lines.length })
  },
}
```

All packages follow the same [conventions](/conventions) for names, options, errors, and cancellation.

### Use in a browser

With a bundler, import the package as in the example above. Without one, import it from esm.sh in a module script:

```js
import * as Lines from 'https://esm.sh/@portable/lines'
```

esm.sh rewrites the imports between `@portable/*` packages to esm.sh URLs. You don't need an import map.

## Runtimes

The packages run in Node 24 or later, Bun, Cloudflare Workers, and current browsers. The tests run in Node, Chromium, Firefox, and WebKit.

`@portable/smtp` also needs a TCP socket API. Browsers don't have one.
