---
description: The rules every Portable package follows for names, streams, options, cancellation, and errors.
---

# Conventions

All packages follow the same rules for names, streams, options, cancellation, and errors. These are the rules.

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
response.body!.pipeThrough(new Jsonl.DecoderStream())
```

## Bytes and text

Functions take and return bytes as `Uint8Array`, never `ArrayBuffer` or `Buffer`. A function that takes text also takes the text's bytes (`string | Uint8Array`). Functions return text as `string`.

## Options

A function takes one optional `options` object as its last argument. No function takes a positional boolean.

## Cancellation

Every async function and every stream takes `signal?: AbortSignal` in its options. When the signal aborts, the function rejects with `signal.reason`, as `fetch` does. The abort also stops the work the function started: its `fetch` calls, timers, readers, and nested streams. For a timeout, pass `AbortSignal.timeout(ms)`.

## Errors

Functions throw errors. No function returns an error as a value.

| Error | Thrown when |
| --- | --- |
| `InvalidInputError` | The data that the function reads, decodes, or verifies is malformed. Catch this error for input from outside your program. |
| `TruncatedError` | The input ended early. |
| `UnsupportedError` | The input is valid, but the package doesn't handle it. |
| `MaxBytesError`, `MaxLengthError` | The input exceeded the `maxBytes` or `maxLength` option. The error stores the limit. |
| `TypeError`, `RangeError` | An argument or option is missing, has the wrong type, or has a value that the function doesn't accept. These errors mean the calling code has a bug. |

Each error's `name` starts with the package's namespace, such as `Lines.MaxLengthError`.

Every error class extends a class from [`errors`](/packages/errors). `Errors.is(error, 'MaxBytes')` matches any package's `MaxBytesError`, even when an app has two copies of the package.

## Results

Functions return plain objects and arrays with documented types, not class instances.
