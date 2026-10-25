---
description: The rules every Portable package follows for names, streams, options, cancellation, and errors.
---

# Conventions

All packages follow the same rules for names, streams, options, cancellation, and errors.

## Names

Import a package as a namespace: `import * as Base64 from '@portable/base64'`. Export names leave out the package name. You write `Base64.encode`, not `encodeBase64`.

Each verb has one meaning in every package:

| Verb | Meaning | Example |
| --- | --- | --- |
| `encode`, `decode` | Convert between a value and its bytes or text. | `Base64.encode(bytes)` |
| `parse` | Read a value out of bytes. There is no function for the other direction. | `ImageSize.parse(bytes)` |
| `parse`, `format` | Read and write a text syntax that people also read, such as an address list. | `MimeHeaders.parseAddresses(text)` |
| `…Stream` suffix | Do the same on a stream. | `ImageSize.parseStream(stream)` |
| `…Sync` suffix | The sync version of an async function. | |

## Streams

A streaming transform is a `TransformStream` subclass, named like `TextDecoderStream`. A `DecoderStream` reads bytes or text into values. An `EncoderStream` writes values as bytes or text.

```ts
response.body!.pipeThrough(new Jsonl.DecoderStream());
```

## Bytes and text

Functions take and return bytes as `Uint8Array`, never `ArrayBuffer` or another view. A Node `Buffer` is a `Uint8Array`, so you can pass one. A function that takes text also takes the text's bytes (`string | Uint8Array`). Functions return text as `string`.

## Options

A function takes the value it acts on as a positional argument and its settings in one optional `options` object, which comes last. A function that mirrors a platform function, such as `Compress.crc32(data, previous)`, copies that function's signature. No function takes a positional boolean.

## Cancellation

Every async function and every stream takes `signal?: AbortSignal` in its options. When the signal aborts, a function rejects with `signal.reason`, as `fetch` does, and a stream errors with it and cancels its source. The abort also stops the work the function started: its `fetch` calls, timers, readers, and nested streams. For a timeout, pass `AbortSignal.timeout(ms)`.

## Connections and other long-lived objects

An object that keeps running after the call that created it, such as an SMTP client, a queue or a debounced function, stops when you call its `close()` method, or when you abort the `signal` you passed when you created it if it has no `close()`. Where the runtime has `Symbol.asyncDispose` (Chrome 134, Firefox 141, Node 24, Deno and Bun), the object also works with `await using`, which stops it when the block exits:

```ts
import { connect } from 'cloudflare:sockets';

await using client = await Smtp.connect({ connect, host: 'smtp.example.com' });
await client.send({ from: 'me@example.com', to: 'you@example.com', message });
```

## Errors

Functions throw errors instead of returning them.

| Error | Thrown when |
| --- | --- |
| `InvalidInputError` | The data that the function reads, decodes, encodes, or verifies is malformed. Catch this error for input from outside your program. |
| `TruncatedError` | The input ended early. |
| `UnsupportedError` | The input is valid, but the package doesn't handle it. |
| `MaxBytesError`, `MaxLengthError` | The input or output exceeded the `maxBytes` or `maxLength` option. The error stores the limit. |
| `ResponseError` | A server answered with a status or body that the package can't use. The error keeps the whole `Response`. |
| `TypeError`, `RangeError` | An argument or option is missing, has the wrong type, or has a value that the function doesn't accept. These errors mean the calling code has a bug. |

Each error's `name` starts with the package's namespace, such as `Lines.MaxLengthError`.

Every error class extends a class from [`errors`](/packages/errors). `Errors.is(error, 'MaxBytes')` matches any package's `MaxBytesError`, even when an app has two copies of the package.

## Results

Functions return plain objects and arrays with documented types, not class instances.
